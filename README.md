# Aroma Coffee Shop Management System

A full-stack starter project for the Coffee Shop Management System assignment.

## Technologies
- React + Vite (frontend)
- Express.js (REST API)
- Fetch API
- MySQL relational database (`mysql2` driver)
- GitHub
- Vercel/Netlify (frontend hosting)
- Render (backend hosting)

## Features
- Customer menu with Maloti prices
- Shopping cart and checkout
- Order numbers formatted as `V0001`, `V0002`, ...
- MySQL-backed menu and orders
- Staff login and protected staff API routes
- Add/update/delete menu items
- View orders and update order status
- Daily order summary
- Health endpoint and request validation

## Requirements
- Node.js 20 or newer recommended
- MySQL 8 or a compatible hosted MySQL database

## 1. Create the MySQL database

Run these commands in MySQL Workbench or a MySQL command line, using an account that can create databases and users:

```sql
CREATE DATABASE aroma_coffee CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'aroma_user'@'localhost' IDENTIFIED BY 'replace-with-your-database-password';
GRANT ALL PRIVILEGES ON aroma_coffee.* TO 'aroma_user'@'localhost';
FLUSH PRIVILEGES;
```

If your MySQL server uses a different host or an existing account, adapt the user and host accordingly. The backend automatically creates its tables and inserts the initial menu the first time it connects to an empty database.

Tables:
- `menu_items` — menu product details and availability.
- `orders` — customer, total, status, and an auto-incrementing order number.
- `order_items` — snapshot of each ordered item, quantity, and price.

The public order ID is created from the database's auto-increment number, for example `V0001`. The database generates unique numbers when concurrent orders are placed. If the database already contains orders, new IDs continue from its current sequence rather than resetting to V0001.

## 2. Start the backend

Open a terminal in `backend/`:

```bash
npm install
```

Copy `.env.example` to `.env` and enter your real MySQL connection details and strong staff/JWT secrets. Do not commit `.env`.

```bash
npm run dev
```

The backend runs on `http://localhost:5000` by default. Test `http://localhost:5000/api/health`; the response should identify MySQL as the database. The backend creates the tables and seeds the menu if `menu_items` is empty.

For a hosted MySQL service, set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, and enable `MYSQL_SSL=true` if the provider requires TLS.

## 3. Start the frontend

Open a second terminal in `frontend/`:

```bash
npm install
```

Copy `.env.example` to `.env` (the default API URL works for local development).

```env
VITE_API_URL=http://localhost:5000
```

Then run:

```bash
npm run dev
```

Open the local URL Vite prints, normally `http://localhost:5173`.

## 4. Staff login

Set `STAFF_USERNAME`, `STAFF_PASSWORD`, and `JWT_SECRET` in `backend/.env`. Use the same username and password in the Staff Login section of the website.

This is an assignment-level login. For a production system, use a proper user database, hashed passwords, rate limiting, HTTPS, secure token handling, and audit logs.

## 5. API endpoints

### Public
- `GET /api/health`
- `GET /api/menu`
- `GET /api/menu/:id`
- `POST /api/orders`
- `GET /api/orders/:id` (limited public order view)

### Staff-authenticated
- `POST /api/staff/login`
- `GET /api/orders`
- `GET /api/staff/summary`
- `POST /api/menu`
- `PUT /api/menu/:id`
- `DELETE /api/menu/:id`
- `PATCH /api/orders/:id/status`

### Order statuses
`Pending` → `Preparing` → `Ready` → `Collected`

## 6. Deployment

### MySQL
Use a managed MySQL provider or a MySQL server accessible to the deployed backend. Configure network access/firewall rules so the backend host can connect. Put all database credentials in the backend service's environment variables, not in React or GitHub. Enable TLS with `MYSQL_SSL=true` when required by the provider.

### Backend on Render
- Create a Web Service connected to the GitHub repository.
- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `backend/.env.example`, using the real hosted MySQL connection settings.
- Set `FRONTEND_ORIGIN` to the deployed frontend URL.
- Test `https://YOUR-BACKEND-URL/api/health`.

### Frontend on Vercel or Netlify
- Import the same GitHub repository.
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` to the deployed backend URL, without a trailing slash.
- Deploy and test the full workflow.

## 7. GitHub safety and final testing

Never commit `.env`, database passwords, or JWT secrets. Keep `.env.example` values as placeholders only.

Before submission:
- Test invalid inputs and failed requests.
- Test placing an order and confirm its ID starts with `V`.
- Test staff-only actions without logging in; they should fail.
- Restart the backend and confirm menu and orders remain in MySQL.
- Capture screenshots of the menu, cart, confirmation, staff dashboard, and MySQL records.
- Complete the group contribution report honestly.
