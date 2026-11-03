import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api.js";

const money = (amount) => `M${Number(amount || 0).toFixed(2)}`;
const categories = ["All", "Coffee", "Tea", "Pastries", "Extras"];
const statuses = ["Pending", "Preparing", "Ready", "Collected"];

function Header({ page, setPage, cartCount }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setPage("menu")} aria-label="Aroma Coffee home">
        <span className="brand-mark">☕</span>
        <span><strong>Aroma</strong><small>COFFEE · GOOD COFFEE, BETTER DAYS</small></span>
      </button>
      <nav>
        <button className={page === "menu" ? "nav-active" : ""} onClick={() => setPage("menu")}>Menu</button>
        <button className={page === "cart" ? "nav-active" : ""} onClick={() => setPage("cart")}>Cart <span className="cart-count">{cartCount}</span></button>
        <button className={page === "staff" ? "nav-active" : ""} onClick={() => setPage("staff")}>Staff</button>
      </nav>
    </header>
  );
}

function MenuPage({ menu, addToCart, loading, error, retry }) {
  const [category, setCategory] = useState("All");
  const shown = category === "All" ? menu : menu.filter((item) => item.category === category);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">FRESH BREWS · WARM MOMENTS</span>
          <h1>Good coffee.<br /><em>Better days.</em></h1>
          <p>Your favourite cup and a little something sweet, made with care.</p>
          <button className="button button-gold" onClick={() => document.getElementById("menu-list")?.scrollIntoView({ behavior: "smooth" })}>Explore the menu ↓</button>
        </div>
        <div className="hero-art" aria-label="Coffee cup illustration" role="img">
          <div className="sun-shape"></div><div className="coffee-cup">☕</div>
          <span className="art-note">Fresh<br />brews<br />great vibes ♡</span>
          <span className="bean bean-one">●</span><span className="bean bean-two">●</span>
        </div>
      </section>

      <section id="menu-list" className="menu-section">
        <div className="section-heading">
          <div><span className="eyebrow">MADE FOR YOUR MOMENT</span><h2>Our <em>menu</em></h2></div>
          <p>Prices in Lesotho Maloti (M)</p>
        </div>
        <div className="category-tabs">
          {categories.map((name) => <button key={name} className={category === name ? "selected" : ""} onClick={() => setCategory(name)}>{name}</button>)}
        </div>
        {loading && <p className="notice">Brewing up the menu…</p>}
        {error && <div className="error-box">{error} <button onClick={retry}>Try again</button></div>}
        {!loading && !error && shown.length === 0 && <p className="notice">No products in this category yet.</p>}
        <div className="menu-grid">
          {shown.map((item) => (
            <article className={`menu-card ${!item.available ? "unavailable" : ""}`} key={item.id}>
              <div className={`product-icon icon-${item.category.toLowerCase()}`}>{item.category === "Coffee" ? "☕" : item.category === "Tea" ? "🍵" : item.category === "Pastries" ? "🥐" : "✨"}</div>
              <div className="product-top"><span className="product-category">{item.category}</span><span className="price-circle">{money(item.price)}</span></div>
              <h3>{item.name}</h3><p>{item.description}</p>
              <button className="button button-dark full-width" disabled={!item.available} onClick={() => addToCart(item)}>{item.available ? "Add to cart +" : "Currently unavailable"}</button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function CartPage({ cart, setCart, placeOrder, busy }) {
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState("");
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  function changeQuantity(id, amount) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: item.quantity + amount } : item).filter((item) => item.quantity > 0));
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!cart.length) return setError("Your cart is empty. Add something from the menu first.");
    if (!customerName.trim()) return setError("Please enter your name.");
    try {
      await placeOrder(customerName.trim());
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <section className="page-section narrow">
      <span className="eyebrow">ALMOST THERE</span><h1>Your <em>cart</em></h1>
      {cart.length === 0 ? <div className="empty-state"><span>🛍️</span><h2>Your cart is waiting for a treat.</h2><p>Add a coffee or pastry from our menu.</p></div> :
        <div className="cart-layout">
          <div className="cart-items">
            {cart.map((item) => <article className="cart-row" key={item.id}>
              <div><h3>{item.name}</h3><p>{money(item.price)} each</p></div>
              <div className="quantity"><button aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)}>−</button><strong>{item.quantity}</strong><button aria-label={`Add one ${item.name}`} onClick={() => changeQuantity(item.id, 1)}>+</button></div>
              <strong>{money(item.price * item.quantity)}</strong>
            </article>)}
            <div className="total-row"><span>Total</span><strong>{money(total)}</strong></div>
          </div>
          <form className="checkout-form" onSubmit={submit}>
            <h2>Checkout</h2><label>Your name<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength="80" placeholder="e.g. Thabo" required /></label>
            <p className="small-note">Your order number will be generated after the order is saved.</p>
            {error && <p className="form-error">{error}</p>}
            <button className="button button-gold full-width" disabled={busy}>{busy ? "Placing order…" : `Place order · ${money(total)}`}</button>
          </form>
        </div>}
    </section>
  );
}

function Confirmation({ order, onBack }) {
  if (!order) return null;
  return <section className="page-section confirmation">
    <div className="confirmation-icon">✓</div><span className="eyebrow">ORDER RECEIVED</span>
    <h1>Thanks for choosing <em>Aroma.</em></h1><p>Your order has been saved. We'll get it ready for you.</p>
    <div className="receipt"><span>YOUR ORDER NUMBER</span><strong className="order-number">{order.id}</strong>
      {order.items.map((item) => <div className="receipt-line" key={item.id}><span>{item.quantity} × {item.name}</span><strong>{money(item.subtotal)}</strong></div>)}
      <div className="receipt-line receipt-total"><span>Total</span><strong>{money(order.total)}</strong></div>
      <div className="receipt-status">Status: <strong>{order.status}</strong></div>
    </div>
    <button className="button button-dark" onClick={onBack}>Back to menu</button>
  </section>;
}

function StaffPage({ token, setToken, menu, reloadMenu, orders, reloadOrders, summary, reloadSummary }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const emptyForm = { name: "", description: "", category: "Coffee", price: "", available: true };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  async function login(event) {
    event.preventDefault(); setMessage(""); setBusy(true);
    try {
      const data = await apiRequest("/api/staff/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setToken(data.token); setMessage("Signed in successfully.");
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }
  function logout() { setToken(""); setMessage("You have signed out."); }
  function startEdit(item) {
    setEditingId(item.id);
    setForm({ name: item.name, description: item.description, category: item.category, price: String(item.price), available: item.available });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function saveMenu(event) {
    event.preventDefault(); setMessage(""); setBusy(true);
    try {
      const path = editingId ? `/api/menu/${editingId}` : "/api/menu";
      await apiRequest(path, { method: editingId ? "PUT" : "POST", body: JSON.stringify({ ...form, price: Number(form.price) }) }, token);
      setForm(emptyForm); setEditingId(null); await reloadMenu(); setMessage("Menu item saved.");
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }
  async function deleteItem(item) {
    if (!window.confirm(`Delete ${item.name} from the menu?`)) return;
    try { await apiRequest(`/api/menu/${item.id}`, { method: "DELETE" }, token); await reloadMenu(); setMessage("Menu item deleted."); }
    catch (err) { setMessage(err.message); }
  }
  async function updateStatus(order, status) {
    try { await apiRequest(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, token); await reloadOrders(); await reloadSummary(); setMessage(`${order.id} updated to ${status}.`); }
    catch (err) { setMessage(err.message); }
  }

  if (!token) return <section className="page-section narrow staff-login">
    <span className="eyebrow">TEAM ACCESS</span><h1>Staff <em>login</em></h1><p>Sign in to manage menu items and customer orders.</p>
    <form className="checkout-form" onSubmit={login}>
      <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      {message && <p className="form-error">{message}</p>}
      <button className="button button-dark full-width" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
    <p className="small-note">Set STAFF_USERNAME and STAFF_PASSWORD in the backend environment.</p>
  </section>;

  return <section className="page-section staff-page">
    <div className="staff-title"><div><span className="eyebrow">AROMA COFFEE TEAM</span><h1>Staff <em>dashboard</em></h1></div><button className="button button-outline" onClick={logout}>Sign out</button></div>
    {message && <p className="notice">{message}</p>}
    <div className="summary-grid">
      <div className="summary-card"><span>Orders today</span><strong>{summary?.orderCount ?? "—"}</strong></div>
      <div className="summary-card"><span>Order value today</span><strong>{summary ? money(summary.orderValue) : "—"}</strong></div>
      <div className="summary-card"><span>Collected value</span><strong>{summary ? money(summary.collectedValue) : "—"}</strong></div>
      <div className="summary-card"><span>Pending orders</span><strong>{summary?.statusCounts?.Pending ?? "—"}</strong></div>
    </div>
    <div className="staff-columns">
      <section className="panel">
        <h2>{editingId ? "Edit menu item" : "Add a menu item"}</h2>
        <form className="staff-form" onSubmit={saveMenu}>
          <label>Item name<input required maxLength="80" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Description<input required maxLength="250" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Price (M)<input type="number" min="0.01" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label className="checkbox-label"><input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} /> Available to order</label>
          <div className="button-row"><button className="button button-gold" disabled={busy}>{editingId ? "Save changes" : "Add item"}</button>{editingId && <button type="button" className="button button-outline" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>}</div>
        </form>
        <h2 className="subheading">Current menu</h2>
        <div className="staff-menu-list">{menu.map((item) => <div className="staff-menu-row" key={item.id}><div><strong>{item.name}</strong><small>{item.category} · {money(item.price)} · {item.available ? "Available" : "Unavailable"}</small></div><div className="button-row"><button className="mini-button" onClick={() => startEdit(item)}>Edit</button><button className="mini-button danger" onClick={() => deleteItem(item)}>Delete</button></div></div>)}</div>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>Customer orders</h2><button className="mini-button" onClick={async () => { await reloadOrders(); await reloadSummary(); }}>Refresh</button></div>
        {orders.length === 0 && <p className="small-note">No orders yet. Customer orders will appear here.</p>}
        <div className="orders-list">{orders.map((order) => <article className="order-card" key={order.id}>
          <div className="order-card-head"><div><strong>{order.id}</strong><span>{new Date(order.createdAt).toLocaleString()}</span></div><strong>{money(order.total)}</strong></div>
          <p className="customer-name">{order.customerName}</p>
          <ul>{order.items.map((item) => <li key={item.id}>{item.quantity} × {item.name} <span>{money(item.subtotal)}</span></li>)}</ul>
          <label className="status-label">Status
            <select value={order.status} onChange={(e) => updateStatus(order, e.target.value)}>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
        </article>)}</div>
      </section>
    </div>
  </section>;
}

export default function App() {
  const [page, setPage] = useState("menu");
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [busyOrder, setBusyOrder] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);

  async function reloadMenu() {
    setLoadingMenu(true); setMenuError("");
    try { setMenu(await apiRequest("/api/menu")); }
    catch (err) { setMenuError(err.message); }
    finally { setLoadingMenu(false); }
  }
  async function reloadOrders() {
    if (!token) return;
    try { setOrders(await apiRequest("/api/orders", {}, token)); }
    catch (err) { if (/session|login/i.test(err.message)) setToken(""); else console.error(err); }
  }
  async function reloadSummary() {
    if (!token) return;
    try { setSummary(await apiRequest("/api/staff/summary", {}, token)); }
    catch (err) { console.error(err); }
  }
  useEffect(() => { reloadMenu(); }, []);
  useEffect(() => { if (token) { reloadOrders(); reloadSummary(); } else { setOrders([]); setSummary(null); } }, [token]);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function addToCart(item) {
    if (!item.available) return;
    setCart((current) => {
      const found = current.find((entry) => entry.id === item.id);
      if (found) return current.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.min(99, entry.quantity + 1) } : entry);
      return [...current, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
    setPage("cart");
  }

  async function placeOrder(customerName) {
    setBusyOrder(true);
    try {
      const order = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({ customerName, items: cart.map((item) => ({ id: item.id, quantity: item.quantity })) })
      });
      setConfirmation(order); setCart([]); setPage("confirmation");
    } finally { setBusyOrder(false); }
  }

  return <div className="app-shell">
    <Header page={page} setPage={setPage} cartCount={cartCount} />
    <main>
      {page === "menu" && <MenuPage menu={menu} addToCart={addToCart} loading={loadingMenu} error={menuError} retry={reloadMenu} />}
      {page === "cart" && <CartPage cart={cart} setCart={setCart} placeOrder={placeOrder} busy={busyOrder} />}
      {page === "confirmation" && <Confirmation order={confirmation} onBack={() => setPage("menu")} />}
      {page === "staff" && <StaffPage token={token} setToken={setToken} menu={menu} reloadMenu={reloadMenu} orders={orders} reloadOrders={reloadOrders} summary={summary} reloadSummary={reloadSummary} />}
    </main>
    <footer><div className="footer-brand">Aroma <em>Coffee</em></div><p>Fresh brews, sweet treats, better days.</p><small>Menu prices shown in Lesotho Maloti (M).</small></footer>
  </div>;
}
