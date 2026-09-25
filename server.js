const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const OWNER_KEY = process.env.OWNER_KEY || "owner123";
const SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";
const DB_FILE = path.join(__dirname, "data", "store.db");

const initialProducts = [
  { name: "Aero Running Shoes", price: 79.99, category: "Footwear", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80" },
  { name: "Urban Sling Bag", price: 42.5, category: "Accessories", image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=80" },
  { name: "Noise-Cancel Headphones", price: 129.0, category: "Electronics", image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=900&q=80" },
  { name: "Smartwatch S2", price: 159.99, category: "Wearables", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80" },
  { name: "Desk Lamp Minimal", price: 36.0, category: "Home", image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=900&q=80" },
  { name: "Water Bottle Steel", price: 19.99, category: "Fitness", image: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80" },
  { name: "Cotton Hoodie", price: 54.0, category: "Apparel", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80" },
  { name: "Mechanical Keyboard", price: 88.75, category: "Electronics", image: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=900&q=80" },
  { name: "Portable Speaker", price: 65.25, category: "Audio", image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=80" },
  { name: "Classic Sunglasses", price: 31.4, category: "Accessories", image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80" }
];

const db = new sqlite3.Database(DB_FILE);

app.use(express.json());
app.use(express.static(__dirname));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function syncToGoogleSheets(eventType, payload) {
  if (!SHEETS_WEBHOOK_URL || typeof fetch !== "function") return;

  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, timestamp: new Date().toISOString(), payload })
    });
  } catch (error) {
    console.error("Google Sheets sync failed:", error.message);
  }
}

function requireOwner(req, res, next) {
  const key = req.query.key || req.headers["x-owner-key"];
  if (key !== OWNER_KEY) {
    return res.status(401).json({ message: "Unauthorized owner access." });
  }
  return next();
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0
    )
  `);

  try {
    // Attempt to add column for existing databases
    await run("ALTER TABLE products ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0");
    // As per requirements, set initial stock value of 10 for existing products
    await run("UPDATE products SET stock_quantity = 10 WHERE stock_quantity = 0");
  } catch (err) {
    // If column already exists, the error is ignored
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      items_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  const count Row = await get("SELECT COUNT(*) AS count FROM products");
  if (!countRow || !countRow.count) {
    for (const product of initialProducts) {
      await run(
        "INSERT INTO products (name, price, category, image, stock_quantity) VALUES (?, ?, ?, ?, ?)",
        [product.name, product.price, product.category, product.image, 10]
      );
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      items_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  const countRow = await get("SELECT COUNT(*) AS count FROM products");
  if (!countRow || !countRow.count) {
    for (const product of initialProducts) {
      await run(
        "INSERT INTO products (name, price, category, image) VALUES (?, ?, ?, ?)",
        [product.name, product.price, product.category, product.image]
      );
    }
  }
}

app.get("/api/products", async (req, res, next) => {
  try {
    const products = await all("SELECT id, name, price, category, image, stock_quantity FROM products ORDER BY id");
    res.json(products);
  } catch (error) {
    next(error);
  }
});

app.post("/api/signup", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Invalid sign up details." });
    }

    const exists = await get("SELECT id FROM users WHERE email = ?", [email]);
    if (exists) {
      return res.status(409).json({ message: "Account already exists. Please login." });
    }

    const name = email.split("@")[0] || "user";
    const createdAt = new Date().toISOString();
    const inserted = await run(
      "INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, ?)",
      [email, password, name, createdAt]
    );

    const user = { id: inserted.id, email, name, createdAt };
    void syncToGoogleSheets("signup", user);
    return res.status(201).json({ user });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const user = await get(
      "SELECT id, email, name, created_at AS createdAt FROM users WHERE email = ? AND password = ?",
      [email, password]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found. Please sign up first." });
    }

    void syncToGoogleSheets("login", user);
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/cart/save", async (req, res, next) => {
  try {
    const userId = Number(req.body.userId);
    const items = Array.isArray(req.body.items) ? req.body.items : null;

    if (!userId || !items) {
      return res.status(400).json({ message: "Invalid cart payload." });
    }

    const user = await get("SELECT id, email FROM users WHERE id = ?", [userId]);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const now = new Date().toISOString();
    const existing = await get("SELECT id FROM carts WHERE user_id = ?", [userId]);
    if (existing) {
      await run("UPDATE carts SET items_json = ?, updated_at = ? WHERE user_id = ?", [JSON.stringify(items), now, userId]);
    } else {
      await run("INSERT INTO carts (user_id, items_json, updated_at) VALUES (?, ?, ?)", [userId, JSON.stringify(items), now]);
    }

    void syncToGoogleSheets("cart_save", {
      userId,
      email: user.email,
      itemCount: items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      items
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    const userId = Number(req.body.userId);
    const items = Array.isArray(req.body.items) ? req.body.items : null;

    if (!userId || !items || items.length === 0) {
      return res.status(400).json({ message: "Invalid order payload." });
    }

    const user = await get("SELECT id, email FROM users WHERE id = ?", [userId]);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const ids = items.map((item) => Number(item.productId)).filter(Boolean);
    if (!ids.length) {
      return res.status(400).json({ message: "No valid items in order." });
    }

    const placeholders = ids.map(() => "?").join(",");
    const productRows = await all(
      `SELECT id, name, price FROM products WHERE id IN (${placeholders})`,
      ids
    );
    const byId = new Map(productRows.map((product) => [product.id, product]));

    const enrichedItems = items
      .map((item) => {
        const product = byId.get(Number(item.productId));
        const qty = Number(item.qty || 0);
        if (!product || qty <= 0) return null;
        const lineTotal = Number((Number(product.price) * qty).toFixed(2));
        return {
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          qty,
          lineTotal
        };
      })
      .filter(Boolean);

    if (!enrichedItems.length) {
      return res.status(400).json({ message: "No valid items in order." });
    }

    const total = Number(enrichedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
    const createdAt = new Date().toISOString();
    const inserted = await run(
      "INSERT INTO orders (user_id, user_email, items_json, total, created_at) VALUES (?, ?, ?, ?, ?)",
      [userId, user.email, JSON.stringify(enrichedItems), total, createdAt]
    );

    await run("UPDATE carts SET items_json = ?, updated_at = ? WHERE user_id = ?", [JSON.stringify([]), createdAt, userId]);

    const order = {
      id: inserted.id,
      userId,
      userEmail: user.email,
      items: enrichedItems,
      total,
      createdAt
    };

    void syncToGoogleSheets("order_created", order);
    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/overview", requireOwner, async (req, res, next) => {
  try {
    const products = await all("SELECT id, name, price, category, image, stock_quantity FROM products ORDER BY id");
    const users = await all("SELECT id, email, name, created_at AS createdAt FROM users ORDER BY id DESC");
    const orderRows = await all("SELECT id, user_id AS userId, user_email AS userEmail, items_json, total, created_at AS createdAt FROM orders ORDER BY id DESC");

    const orders = orderRows.map((order) => ({
      ...order,
      items: JSON.parse(order.items_json || "[]")
    }));

    res.json({
      totals: { products: products.length, users: users.length, orders: orders.length },
      products,
      users,
      orders
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/products", requireOwner, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const price = Number(req.body.price);
    const category = String(req.body.category || "General").trim();
    const image = String(req.body.image || "https://via.placeholder.com/800x600?text=Product").trim();

    if (!name || Number.isNaN(price)) {
      return res.status(400).json({ message: "Product name and price are required." });
    }

    const inserted = await run(
      "INSERT INTO products (name, price, category, image) VALUES (?, ?, ?, ?)",
      [name, price, category, image]
    );

    const product = { id: inserted.id, name, price, category, image };
    return res.status(201).json({ product });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/admin/products/:id", requireOwner, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await get("SELECT id FROM products WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({ message: "Product not found." });
    }

    const current = await get("SELECT id, name, price, category, image, stock_quantity FROM products WHERE id = ?", [id]);

    const name = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
    const price = req.body.price !== undefined ? Number(req.body.price) : Number(current.price);
    const category = req.body.category !== undefined ? String(req.body.category).trim() : current.category;
    const image = req.body.image !== undefined ? String(req.body.image).trim() : current.image;
    const stock_quantity = req.body.stock_quantity !== undefined ? Number(req.body.stock_quantity) : current.stock_quantity;

    if (stock_quantity < 0) {
      return res.status(400).json({ message: "Stock quantity cannot be negative." });
    }

    await run(
      "UPDATE products SET name = ?, price = ?, category = ?, image = ?, stock_quantity = ? WHERE id = ?",
      [name, price, category, image, stock_quantity, id]
    );

    return res.json({ product: { id, name, price, category, image, stock_quantity } });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/admin/products/:id", requireOwner, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await run("DELETE FROM products WHERE id = ?", [id]);
    if (!result.changes) {
      return res.status(404).json({ message: "Product not found." });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/admin/users/:id", requireOwner, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await get("SELECT id, email FROM users WHERE id = ?", [id]);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await run("DELETE FROM carts WHERE user_id = ?", [id]);
    await run("DELETE FROM users WHERE id = ?", [id]);

    void syncToGoogleSheets("user_deleted", { userId: user.id, email: user.email });
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Unexpected server error. Please try again." });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Cartlane server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
