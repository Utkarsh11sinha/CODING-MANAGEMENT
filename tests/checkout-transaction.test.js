// Issue #5: order creation, stock deduction and cart clearing commit or roll back together.
// See docs/inventory_spec.md, Unit 4. Run with: node --test tests/
//
// Boots a copy of server.js in a temp directory so the test gets its own
// SQLite database and never touches data/store.db (same pattern as
// checkout-stock.test.js).

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3");

const ROOT = path.join(__dirname, "..");
const OWNER_KEY = "test-owner-key";
const PORT = 5000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;

let workDir;
let server;
let dbFile;

async function startServer() {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cartlane-test-"));
  fs.mkdirSync(path.join(workDir, "data"));
  fs.copyFileSync(path.join(ROOT, "server.js"), path.join(workDir, "server.js"));
  dbFile = path.join(workDir, "data", "store.db");

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

// Runs SQL directly against the test server's database on a short-lived connection.
// Used to read carts (no API returns them) and to inject a failure.
function sql(method, statement, params = []) {
  return new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(dbFile);
    conn.configure("busyTimeout", 5000);
    conn[method](statement, params, (err, result) => {
      conn.close(() => (err ? reject(err) : resolve(result)));
    });
  });
}

async function createUserWithCart(email, items) {
  const signup = await api("POST", "/api/signup", { email, password: "secret" });
  assert.equal(signup.status, 201, `signup failed: ${JSON.stringify(signup.body)}`);
  const userId = signup.body.user.id;
  const saved = await api("POST", "/api/cart/save", { userId, items });
  assert.equal(saved.status, 200, `cart save failed: ${JSON.stringify(saved.body)}`);
  return userId;
}

async function readCart(userId) {
  const row = await sql("get", "SELECT items_json FROM carts WHERE user_id = ?", [userId]);
  return JSON.parse(row.items_json);
}

async function overview() {
  const res = await api("GET", "/api/admin/overview");
  assert.equal(res.status, 200);
  return res.body;
}

function stockOf(snapshot, productId) {
  return snapshot.products.find((p) => p.id === productId).stock_quantity;
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

test("a successful order deducts stock, creates the order and clears the cart", async () => {
  const start = await overview();
  const [a, b, untouched] = start.products;
  const items = [
    { productId: a.id, qty: 3 },
    { productId: b.id, qty: 2 }
  ];
  const userId = await createUserWithCart("tx-success@example.com", items);

  const order = await api("POST", "/api/orders", { userId, items });
  assert.equal(order.status, 201, `order failed: ${JSON.stringify(order.body)}`);

  const end = await overview();
  assert.equal(end.totals.orders, start.totals.orders + 1, "one order should be created");
  assert.equal(stockOf(end, a.id), a.stock_quantity - 3);
  assert.equal(stockOf(end, b.id), b.stock_quantity - 2);
  assert.equal(stockOf(end, untouched.id), untouched.stock_quantity, "products not ordered keep their stock");
  assert.deepEqual(await readCart(userId), [], "cart should be cleared");
});

test("a failure after the order insert and stock deduction rolls all of them back", async () => {
  const start = await overview();
  const [a, b] = start.products;
  const items = [
    { productId: a.id, qty: 1 },
    { productId: b.id, qty: 1 }
  ];
  const userId = await createUserWithCart("tx-rollback@example.com", items);

  // Cart clearing is the last write in the transaction, so aborting it means
  // the order insert and both stock deductions have already run.
  await sql(
    "run",
    `CREATE TRIGGER fail_cart_clear BEFORE UPDATE ON carts WHEN OLD.user_id = ${userId}
     BEGIN SELECT RAISE(ABORT, 'forced cart clear failure'); END`
  );

  try {
    const order = await api("POST", "/api/orders", { userId, items });
    assert.equal(order.status, 500, `expected the forced failure to surface, got ${order.status}: ${JSON.stringify(order.body)}`);

    const end = await overview();
    assert.equal(end.totals.orders, start.totals.orders, "no order should be created");
    assert.equal(stockOf(end, a.id), a.stock_quantity, "stock should be unchanged");
    assert.equal(stockOf(end, b.id), b.stock_quantity, "stock should be unchanged");
    assert.deepEqual(await readCart(userId), items, "cart should be unchanged");
  } finally {
    await sql("run", "DROP TRIGGER fail_cart_clear");
  }

  // The rolled-back transaction must not leave the server stuck: the same order now succeeds.
  const retry = await api("POST", "/api/orders", { userId, items });
  assert.equal(retry.status, 201, `retry failed: ${JSON.stringify(retry.body)}`);
  const afterRetry = await overview();
  assert.equal(stockOf(afterRetry, a.id), a.stock_quantity - 1);
  assert.deepEqual(await readCart(userId), []);
});

test("repeated lines for one product are limited by their summed quantity", async () => {
  const start = await overview();
  const product = start.products[5];
  assert.equal(product.stock_quantity, 10, "test assumes an untouched seeded product");

  // Each line fits on its own (6 <= 10), but together they need 12.
  const tooMany = [
    { productId: product.id, qty: 6 },
    { productId: product.id, qty: 6 }
  ];
  const userId = await createUserWithCart("tx-repeat@example.com", tooMany);
  const rejected = await api("POST", "/api/orders", { userId, items: tooMany });
  assert.equal(rejected.status, 400, `expected 400, got ${rejected.status}: ${JSON.stringify(rejected.body)}`);
  assert.equal(rejected.body.message, `Insufficient stock for ${product.name}.`);

  const afterReject = await overview();
  assert.equal(afterReject.totals.orders, start.totals.orders, "no order should be created");
  assert.equal(stockOf(afterReject, product.id), 10, "first line's deduction should be rolled back");
  assert.deepEqual(await readCart(userId), tooMany, "cart should be unchanged");

  // Lines summing to exactly the stock succeed.
  const exact = await api("POST", "/api/orders", {
    userId,
    items: [
      { productId: product.id, qty: 6 },
      { productId: product.id, qty: 4 }
    ]
  });
  assert.equal(exact.status, 201, `expected 201, got ${exact.status}: ${JSON.stringify(exact.body)}`);
  assert.equal(stockOf(await overview(), product.id), 0);
});

test("a fractional quantity rejects the whole order and leaves stock untouched", async () => {
  const start = await overview();
  const product = start.products[6];
  const other = start.products[7];
  // The fractional line comes second, so a valid line alone cannot slip through.
  const items = [
    { productId: other.id, qty: 1 },
    { productId: product.id, qty: 1.5 }
  ];
  const userId = await createUserWithCart("tx-fraction@example.com", items);

  const order = await api("POST", "/api/orders", { userId, items });
  assert.equal(order.status, 400, `expected 400, got ${order.status}: ${JSON.stringify(order.body)}`);
  assert.equal(order.body.message, "Quantity must be a whole number.");

  const end = await overview();
  assert.equal(end.totals.orders, start.totals.orders, "no order should be created");
  assert.equal(stockOf(end, product.id), product.stock_quantity, "stock should be unchanged");
  assert.equal(stockOf(end, other.id), other.stock_quantity, "stock should be unchanged");
  assert.deepEqual(await readCart(userId), items, "cart should be unchanged");
});

test("concurrent orders cannot oversell: only the ones that fit in stock succeed", async () => {
  const product = (await overview()).products[3];
  const set = await api("PUT", `/api/admin/products/${product.id}`, { stock_quantity: 5 });
  assert.equal(set.status, 200);

  const items = [{ productId: product.id, qty: 3 }];
  const first = await createUserWithCart("tx-race-1@example.com", items);
  const second = await createUserWithCart("tx-race-2@example.com", items);
  const start = await overview();

  // Each order passes a stock check on its own (3 <= 5); together they would oversell.
  const results = await Promise.all([
    api("POST", "/api/orders", { userId: first, items }),
    api("POST", "/api/orders", { userId: second, items })
  ]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 400], `expected one success and one rejection, got ${JSON.stringify(results)}`);
  assert.equal(results.find((r) => r.status === 400).body.message, `Insufficient stock for ${product.name}.`);

  const end = await overview();
  assert.equal(end.totals.orders, start.totals.orders + 1);
  assert.equal(stockOf(end, product.id), 2);

  // Ordering exactly the remaining stock still succeeds and leaves zero.
  const exact = await api("POST", "/api/orders", { userId: second, items: [{ productId: product.id, qty: 2 }] });
  assert.equal(exact.status, 201, `exact-stock order failed: ${JSON.stringify(exact.body)}`);
  assert.equal(stockOf(await overview(), product.id), 0);
});
