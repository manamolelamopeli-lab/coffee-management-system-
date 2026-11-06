require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const STAFF_USERNAME = process.env.STAFF_USERNAME;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;

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

// Initialize Redis Client
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));

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

// --- REDIS DATA HELPERS ---
async function getMenuItem(id) {
  const data = await redisClient.get(`menu:${id}`);
  return data ? JSON.parse(data) : null;
}

async function getAllMenu() {
  const ids = await redisClient.sMembers("menu:ids");
  const items = [];
  for (const id of ids) {
    const item = await getMenuItem(id);
    if (item) items.push(item);
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function getOrder(id) {
  const data = await redisClient.get(`order:${id}`);
  return data ? JSON.parse(data) : null;
}

async function getAllOrders() {
  const ids = await redisClient.sMembers("order:ids");
  const orders = [];
  for (const id of ids) {
    const order = await getOrder(id);
    if (order) orders.push(order);
  }
  // Sort descending by creation date
  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function initialiseDatabase() {
  const ids = await redisClient.sMembers("menu:ids");
  if (ids.length > 0) return;

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
    const id = crypto.randomUUID();
    const newItem = {
      id,
      name: item.name,
      description: item.description,
      category: item.category,
      price: item.price,
      available: true,
      createdAt: new Date().toISOString()
    };
    await redisClient.set(`menu:${id}`, JSON.stringify(newItem));
    await redisClient.sAdd("menu:ids", id);
  }
  console.log("Seeded initial Aroma Coffee menu in Redis.");
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
    await redisClient.ping();
    res.json({ status: "OK", database: "connected", databaseType: "Redis (Key-Value NoSQL)", service: "Aroma Coffee API" });
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
    const id = crypto.randomUUID();
    const item = {
      id,
      name: readText(req.body.name, "Name", 80),
      description: readText(req.body.description, "Description", 250),
      category: readText(req.body.category, "Category", 40),
      price: readPrice(req.body.price),
      available: readBoolean(req.body.available),
      createdAt: new Date().toISOString()
    };
    await redisClient.set(`menu:${id}`, JSON.stringify(item));
    await redisClient.sAdd("menu:ids", id);
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
    await redisClient.set(`menu:${req.params.id}`, JSON.stringify(item));
    res.json(item);
  } catch (error) { next(error); }
});

app.delete("/api/menu/:id", requireStaff, async (req, res, next) => {
  try {
    const deleted = await redisClient.del(`menu:${req.params.id}`);
    if (!deleted) throw httpError(404, "Menu item not found.");
    await redisClient.sRem("menu:ids", req.params.id);
    res.json({ message: "Menu item deleted." });
  } catch (error) { next(error); }
});

app.post("/api/orders", async (req, res, next) => {
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

    // Generate auto-incrementing sequential order number using Redis INCR counter
    const orderNumber = await redisClient.incr("order:counter");
    const orderId = publicOrderId(orderNumber);
    const timestamp = new Date().toISOString();

    const order = {
      id: orderId,
      customerName,
      items,
      total,
      currency: "LSL",
      status: "Pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await redisClient.set(`order:${orderId}`, JSON.stringify(order));
    await redisClient.sAdd("order:ids", orderId);

    res.status(201).json(order);
  } catch (error) { next(error); }
});

app.get("/api/orders/:id", async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) throw httpError(404, "Order not found.");
    res.json(order);
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
    if (nextStatus !== order.status && !transitions[order.status].includes(nextStatus)) {
      throw httpError(400, `Invalid status change from ${order.status} to ${nextStatus}.`);
    }

    order.status = nextStatus;
    order.updatedAt = new Date().toISOString();

    await redisClient.set(`order:${order.id}`, JSON.stringify(order));
    res.json(order);
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
    
    res.json({
      date: today,
      orderCount: todaysOrders.length,
      orderValue: Math.round(orderValue * 100) / 100,
      collectedValue: Math.round(collectedValue * 100) / 100,
      statusCounts
    });
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
    await redisClient.connect();
    await initialiseDatabase();
    app.listen(PORT, () => console.log(`Aroma Coffee API running on port ${PORT} with Redis NoSQL`));
  } catch (error) {
    console.error("Could not start backend. Check Redis connection settings:", error.message);
    process.exit(1);
  }
}

start();