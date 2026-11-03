require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const STAFF_USERNAME = process.env.STAFF_USERNAME;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;

if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_DATABASE) {
  console.error("Set MYSQL_HOST, MYSQL_USER and MYSQL_DATABASE in backend/.env.");
  process.exit(1);
}
if (!JWT_SECRET || !STAFF_USERNAME || !STAFF_PASSWORD) {
  console.error("Set JWT_SECRET, STAFF_USERNAME and STAFF_PASSWORD in backend/.env.");
  process.exit(1);
}

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(",").map((value) => value.trim())
    : true
}));
app.use(express.json({ limit: "100kb" }));

const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
  decimalNumbers: true,
  ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: true } : undefined
});

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function readText(value, field, maxLength = 100) {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, `${field} is required.`);
  const result = value.trim();
  if (result.length > maxLength) throw httpError(400, `${field} must be ${maxLength} characters or fewer.`);
  return result;
}
function readPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0 || price > 100000) throw httpError(400, "Price must be a positive number.");
  return Math.round(price * 100) / 100;
}
function readBoolean(value, field = "Availability") {
  if (typeof value !== "boolean") throw httpError(400, `${field} must be true or false.`);
  return value;
}
function readQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw httpError(400, "Quantity must be a whole number from 1 to 99.");
  return quantity;
}
function publicOrderId(number) {
  return `V${String(number).padStart(4, "0")}`;
}
function orderNumberFromId(id) {
  if (typeof id !== "string" || !/^V\d+$/.test(id)) return null;
  const number = Number(id.slice(1));
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function mapMenu(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    available: Boolean(row.available),
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.updated_at ? { updatedAt: new Date(row.updated_at).toISOString() } : {})
  };
}
function mapOrder(row, items) {
  return {
    id: publicOrderId(row.order_number),
    customerName: row.customer_name,
    items,
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
async function getMenuItem(id) {
  const [rows] = await db.execute("SELECT * FROM menu_items WHERE id = ? LIMIT 1", [id]);
  return rows.length ? mapMenu(rows[0]) : null;
}
async function getAllMenu() {
  const [rows] = await db.execute("SELECT * FROM menu_items ORDER BY name ASC");
  return rows.map(mapMenu);
}
async function getOrder(id) {
  const number = orderNumberFromId(id);
  if (!number) return null;
  const [rows] = await db.execute("SELECT * FROM orders WHERE order_number = ? LIMIT 1", [number]);
  if (!rows.length) return null;
  const [itemRows] = await db.execute(
    "SELECT menu_item_id, item_name, unit_price, quantity, subtotal FROM order_items WHERE order_number = ? ORDER BY id ASC",
    [number]
  );
  const items = itemRows.map((item) => ({
    id: item.menu_item_id,
    name: item.item_name,
    unitPrice: Number(item.unit_price),
    quantity: Number(item.quantity),
    subtotal: Number(item.subtotal)
  }));
  return mapOrder(rows[0], items);
}
async function getAllOrders() {
  const [rows] = await db.execute("SELECT * FROM orders ORDER BY created_at DESC, order_number DESC");
  const orders = await Promise.all(rows.map((row) => getOrder(publicOrderId(row.order_number))));
  return orders.filter(Boolean);
}
async function initialiseDatabase() {
  await db.execute(`CREATE TABLE IF NOT EXISTS menu_items (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(250) NOT NULL,
    category VARCHAR(40) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_menu_category (category),
    INDEX idx_menu_available (available)
  ) ENGINE=InnoDB`);
  await db.execute(`CREATE TABLE IF NOT EXISTS orders (
    order_number BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(80) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'LSL',
    status ENUM('Pending','Preparing','Ready','Collected') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_created_at (created_at),
    INDEX idx_orders_status (status)
  ) ENGINE=InnoDB`);
  await db.execute(`CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_number BIGINT UNSIGNED NOT NULL,
    menu_item_id VARCHAR(36) NOT NULL,
    item_name VARCHAR(80) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_number) REFERENCES orders(order_number) ON DELETE CASCADE,
    INDEX idx_order_items_order (order_number)
  ) ENGINE=InnoDB`);

  const [countRows] = await db.execute("SELECT COUNT(*) AS count FROM menu_items");
  if (Number(countRows[0].count) > 0) return;
  const seedItems = [
    { name: "Espresso", description: "Bold and rich", category: "Coffee", price: 30 },
    { name: "Americano", description: "Smooth and balanced", category: "Coffee", price: 35 },
    { name: "Cappuccino", description: "Espresso, steamed milk, foam", category: "Coffee", price: 40 },
    { name: "Latte", description: "Espresso and steamed milk", category: "Coffee", price: 45 },
    { name: "Mocha", description: "Espresso, chocolate, steamed milk", category: "Coffee", price: 50 },
    { name: "Caramel Macchiato", description: "Espresso, vanilla, caramel, milk", category: "Coffee", price: 55 },
    { name: "English Breakfast Tea", description: "Classic and refreshing", category: "Tea", price: 30 },
    { name: "Green Tea", description: "Light and soothing", category: "Tea", price: 30 },
    { name: "Chai Latte", description: "Spiced and comforting", category: "Tea", price: 45 },
    { name: "Iced Tea", description: "Cool and crisp", category: "Tea", price: 35 },
    { name: "Croissant", description: "Buttery and flaky", category: "Pastries", price: 35 },
    { name: "Chocolate Croissant", description: "Filled with rich chocolate", category: "Pastries", price: 40 },
    { name: "Blueberry Muffin", description: "Fresh and fruity", category: "Pastries", price: 35 },
    { name: "Cinnamon Roll", description: "Warm and sweet", category: "Pastries", price: 45 },
    { name: "Banana Bread", description: "Moist and delicious", category: "Pastries", price: 30 },
    { name: "Extra Shot", description: "Add an extra espresso shot", category: "Extras", price: 10 },
    { name: "Oat Milk", description: "Milk alternative", category: "Extras", price: 15 },
    { name: "Almond Milk", description: "Milk alternative", category: "Extras", price: 15 },
    { name: "Whipped Cream", description: "Creamy topping", category: "Extras", price: 5 },
    { name: "Flavoured Syrup", description: "Vanilla, caramel or hazelnut", category: "Extras", price: 5 }
  ];
  for (const item of seedItems) {
    await db.execute(
      "INSERT INTO menu_items (id, name, description, category, price, available) VALUES (?, ?, ?, ?, ?, TRUE)",
      [crypto.randomUUID(), item.name, item.description, item.category, item.price]
    );
  }
  console.log("Seeded initial Aroma Coffee menu in MySQL.");
}
function requireStaff(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Staff login is required." });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "staff") return res.status(403).json({ error: "Staff permission is required." });
    req.staff = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Session is invalid or expired. Please log in again." });
  }
}

app.get("/api/health", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "OK", database: "connected", databaseType: "MySQL", service: "Aroma Coffee API" });
  } catch (error) { next(error); }
});
app.get("/api/menu", async (req, res, next) => {
  try { res.json(await getAllMenu()); } catch (error) { next(error); }
});
app.get("/api/menu/:id", async (req, res, next) => {
  try {
    const item = await getMenuItem(req.params.id);
    if (!item) throw httpError(404, "Menu item not found.");
    res.json(item);
  } catch (error) { next(error); }
});
app.post("/api/staff/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== STAFF_USERNAME || password !== STAFF_PASSWORD) return res.status(401).json({ error: "Incorrect username or password." });
  const token = jwt.sign({ username, role: "staff" }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, username, expiresIn: "8h" });
});
app.post("/api/menu", requireStaff, async (req, res, next) => {
  try {
    const item = {
      id: crypto.randomUUID(),
      name: readText(req.body.name, "Name", 80),
      description: readText(req.body.description, "Description", 250),
      category: readText(req.body.category, "Category", 40),
      price: readPrice(req.body.price),
      available: readBoolean(req.body.available),
      createdAt: new Date().toISOString()
    };
    await db.execute("INSERT INTO menu_items (id, name, description, category, price, available) VALUES (?, ?, ?, ?, ?, ?)",
      [item.id, item.name, item.description, item.category, item.price, item.available]);
    res.status(201).json(item);
  } catch (error) { next(error); }
});
app.put("/api/menu/:id", requireStaff, async (req, res, next) => {
  try {
    const existing = await getMenuItem(req.params.id);
    if (!existing) throw httpError(404, "Menu item not found.");
    const item = {
      ...existing,
      name: readText(req.body.name, "Name", 80),
      description: readText(req.body.description, "Description", 250),
      category: readText(req.body.category, "Category", 40),
      price: readPrice(req.body.price),
      available: readBoolean(req.body.available),
      updatedAt: new Date().toISOString()
    };
    await db.execute("UPDATE menu_items SET name = ?, description = ?, category = ?, price = ?, available = ? WHERE id = ?",
      [item.name, item.description, item.category, item.price, item.available, item.id]);
    res.json(item);
  } catch (error) { next(error); }
});
app.delete("/api/menu/:id", requireStaff, async (req, res, next) => {
  try {
    const [result] = await db.execute("DELETE FROM menu_items WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) throw httpError(404, "Menu item not found.");
    res.json({ message: "Menu item deleted." });
  } catch (error) { next(error); }
});
app.post("/api/orders", async (req, res, next) => {
  let connection;
  try {
    const customerName = readText(req.body.customerName, "Customer name", 80);
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) throw httpError(400, "Add at least one item to your order.");
    if (req.body.items.length > 50) throw httpError(400, "Too many different items in one order.");
    const requested = new Map();
    for (const entry of req.body.items) {
      const id = readText(entry.id, "Menu item ID", 100);
      const quantity = readQuantity(entry.quantity);
      requested.set(id, (requested.get(id) || 0) + quantity);
    }
    const items = [];
    let total = 0;
    for (const [id, quantity] of requested.entries()) {
      const menuItem = await getMenuItem(id);
      if (!menuItem) throw httpError(400, "One of the selected menu items no longer exists.");
      if (!menuItem.available) throw httpError(400, `${menuItem.name} is currently unavailable.`);
      if (quantity > 99) throw httpError(400, "Maximum quantity per item is 99.");
      const subtotal = Math.round(menuItem.price * quantity * 100) / 100;
      total += subtotal;
      items.push({ id: menuItem.id, name: menuItem.name, unitPrice: menuItem.price, quantity, subtotal });
    }
    total = Math.round(total * 100) / 100;
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [orderResult] = await connection.execute(
      "INSERT INTO orders (customer_name, total, currency, status) VALUES (?, ?, 'LSL', 'Pending')", [customerName, total]);
    const orderNumber = orderResult.insertId;
    for (const item of items) {
      await connection.execute(
        "INSERT INTO order_items (order_number, menu_item_id, item_name, unit_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [orderNumber, item.id, item.name, item.unitPrice, item.quantity, item.subtotal]);
    }
    await connection.commit();
    const order = await getOrder(publicOrderId(orderNumber));
    res.status(201).json(order);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally {
    if (connection) connection.release();
  }
});
app.get("/api/orders/:id", async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) throw httpError(404, "Order not found.");
    res.json({ id: order.id, customerName: order.customerName, items: order.items, total: order.total, currency: order.currency, status: order.status, createdAt: order.createdAt });
  } catch (error) { next(error); }
});
app.get("/api/orders", requireStaff, async (req, res, next) => {
  try { res.json(await getAllOrders()); } catch (error) { next(error); }
});
app.patch("/api/orders/:id/status", requireStaff, async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) throw httpError(404, "Order not found.");
    const allowedStatuses = ["Pending", "Preparing", "Ready", "Collected"];
    const nextStatus = req.body.status;
    if (!allowedStatuses.includes(nextStatus)) throw httpError(400, "Status must be Pending, Preparing, Ready or Collected.");
    const transitions = { Pending: ["Preparing"], Preparing: ["Ready"], Ready: ["Collected"], Collected: [] };
    if (nextStatus !== order.status && !transitions[order.status].includes(nextStatus)) throw httpError(400, `Invalid status change from ${order.status} to ${nextStatus}.`);
    const number = orderNumberFromId(order.id);
    await db.execute("UPDATE orders SET status = ? WHERE order_number = ?", [nextStatus, number]);
    res.json(await getOrder(order.id));
  } catch (error) { next(error); }
});
app.get("/api/staff/summary", requireStaff, async (req, res, next) => {
  try {
    const orders = await getAllOrders();
    const today = new Date().toISOString().slice(0, 10);
    const todaysOrders = orders.filter((order) => order.createdAt.slice(0, 10) === today);
    const statusCounts = { Pending: 0, Preparing: 0, Ready: 0, Collected: 0 };
    let orderValue = 0;
    let collectedValue = 0;
    for (const order of todaysOrders) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      orderValue += order.total;
      if (order.status === "Collected") collectedValue += order.total;
    }
    res.json({ date: today, orderCount: todaysOrders.length, orderValue: Math.round(orderValue * 100) / 100, collectedValue: Math.round(collectedValue * 100) / 100, statusCounts });
  } catch (error) { next(error); }
});
app.use((req, res) => res.status(404).json({ error: "Endpoint not found." }));
app.use((error, req, res, next) => {
  console.error(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({ error: status === 500 ? "Something went wrong on the server. Please try again." : error.message });
});
async function start() {
  try {
    await db.query("SELECT 1");
    await initialiseDatabase();
    app.listen(PORT, () => console.log(`Aroma Coffee API running on port ${PORT} with MySQL`));
  } catch (error) {
    console.error("Could not start backend. Check MySQL connection settings:", error.message);
    process.exit(1);
  }
}
start();
