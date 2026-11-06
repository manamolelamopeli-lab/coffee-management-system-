require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");
const crypto = require("crypto");

// 1. Initialize Express first
const app = express();

// 2. Configure and apply CORS middleware immediately after app initialization
app.use(cors({
  origin: [
    'https://coffee-management-system-pearl.vercel.app',
    'http://localhost:5173',
    'http://localhost:5000'
  ],
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const STAFF_USERNAME = process.env.STAFF_USERNAME;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;

if (!JWT_SECRET || !STAFF_USERNAME || !STAFF_PASSWORD) {
  console.error("Set JWT_SECRET, STAFF_USERNAME and STAFF_PASSWORD in backend/.env.");
  process.exit(1);
}

// Redis client setup
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));

async function initialiseDatabase() {
  const existingMenu = await redisClient.exists("menu:items");
  if (!existingMenu) {
    const defaultMenu = [
      { id: "1", name: "Americano", category: "Coffee", price: 25, description: "Rich espresso with hot water" },
      { id: "2", name: "Cappuccino", category: "Coffee", price: 30, description: "Espresso with steamed milk and foam" },
      { id: "3", name: "Motoho", category: "Tea", price: 20, description: "Traditional fermented sorghum beverage" },
      { id: "4", name: "Croissant", category: "Pastries", price: 22, description: "Buttery and flaky pastry" }
    ];
    for (const item of defaultMenu) {
      await redisClient.hSet("menu:items", item.id, JSON.stringify(item));
    }
    console.log("Initialized default menu items in Redis.");
  }
}

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/api/menu", async (req, res) => {
  try {
    const items = await redisClient.hGetAll("menu:items");
    const menuList = Object.values(items).map(item => JSON.parse(item));
    res.json(menuList);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === STAFF_USERNAME && password === STAFF_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "8h" });
    return res.json({ token, user: { username } });
  }
  res.status(401).json({ error: "Invalid credentials" });
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