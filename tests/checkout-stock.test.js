// C3 regression: checkout must reject an order whose qty exceeds stock_quantity.
// See docs/bug-fix.md. Run with: node --test tests/
//
// Boots a copy of server.js in a temp directory so the test gets its own
// SQLite database and never touches data/store.db.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OWNER_KEY = "test-owner-key";
const PORT = 4000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;

let workDir;
let server;

async function startServer() {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cartlane-test-"));
  fs.mkdirSync(path.join(workDir, "data"));
  fs.copyFileSync(path.join(ROOT, "server.js"), path.join(workDir, "server.js"));

  server = spawn(process.execPath, ["server.js"], {
    cwd: workDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      OWNER_KEY,
      GOOGLE_SHEETS_WEBHOOK_URL: "",
      NODE_PATH: path.join(ROOT, "node_modules")
    }
  });

  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start within 10s.\n${output}`)), 10000);
    server.stdout.on("data", () => {
      if (output.includes("Cartlane server running")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with code ${code} before listening.\n${output}`));
    });
  });
}

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { "Content-Type": "application/json", "x-owner-key": OWNER_KEY },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

before(startServer);

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited; // Windows keeps store.db locked until the process is gone
  }
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

test("checkout rejects an order whose quantity exceeds available stock", async () => {
  const signup = await api("POST", "/api/signup", {
    email: "stock-overflow@example.com",
    password: "secret",
    name: "Stock Tester"
  });
  assert.equal(signup.status, 201, `signup failed: ${JSON.stringify(signup.body)}`);
  const userId = signup.body.user.id;

  const before = await api("GET", "/api/admin/overview");
  const product = before.body.products[0];
  assert.ok(product.stock_quantity > 0, "seeded product should have stock");

  const order = await api("POST", "/api/orders", {
    userId,
    items: [{ productId: product.id, qty: product.stock_quantity + 1 }]
  });

  assert.equal(order.status, 400, `expected 400 for qty > stock, got ${order.status}: ${JSON.stringify(order.body)}`);

  const afterOverview = await api("GET", "/api/admin/overview");
  assert.equal(afterOverview.body.totals.orders, before.body.totals.orders, "no order should be created");
  const productAfter = afterOverview.body.products.find((p) => p.id === product.id);
  assert.equal(productAfter.stock_quantity, product.stock_quantity, "stock should be unchanged");
});
