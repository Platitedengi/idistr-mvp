const API = import.meta.env.VITE_API_BASE;

export async function getRepMe(telegram_id) {
  const res = await fetch(`${API}/v1/reps/me?telegram_id=${encodeURIComponent(telegram_id)}`);
  if (!res.ok) {
    // даём понятный маркер, чтобы App.jsx мог отличить 404 от остальных
    const text = await res.text().catch(() => "");
    const err = new Error("reps/me failed");
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

export async function getProducts(search = "", page = 1, limit = 100) {
  const url = new URL(`${API}/v1/products`);
  if (search) url.searchParams.set("search", search);
  url.searchParams.set("page", page);
  url.searchParams.set("limit", limit);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error("products failed");
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

export async function createOrder(payload) {
  const res = await fetch(`${API}/v1/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error("order failed");
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}
