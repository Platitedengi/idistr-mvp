// src/api.js

// Prefer VITE_API_BASE, fallback to VITE_API_URL for compatibility.
const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  "";

/**
 * Ensure API is configured at build time.
 */
function assertApiBase() {
  if (!API) {
    throw new Error(
      "API base URL is not configured. Set VITE_API_BASE in your env (e.g. https://idistr-backend.onrender.com)."
    );
  }
}

/**
 * Unified JSON request helper with better error details.
 * - Adds JSON headers automatically when body is provided.
 * - Serializes query params safely.
 * - Normalizes errors: err.status, err.detail (from FastAPI).
 */
async function requestJSON(path, { method = "GET", query, body } = {}) {
  assertApiBase();

  const url = new URL(path, API);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }

  const init = { method, headers: {} };

  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), init);

  if (!res.ok) {
    // Try to extract FastAPI error payload
    let detail = null;
    try {
      const data = await res.clone().json();
      // FastAPI usually returns {detail: "..."} or an array of errors
      detail = data?.detail ?? data;
    } catch {
      try {
        detail = await res.text();
      } catch {
        detail = null;
      }
    }
    const err = new Error(`Request failed ${res.status} ${res.statusText} @ ${url.pathname}`);
    err.status = res.status;
    err.detail = detail;
    err.url = url.toString();
    throw err;
  }

  return res.json();
}

export async function getRepMe(telegram_id) {
  return requestJSON("/v1/reps/me", {
    query: { telegram_id },
  }).catch((err) => {
    // provide stable marker the app can rely on
    const wrapped = new Error("reps/me failed");
    wrapped.status = err.status;
    wrapped.detail = err.detail;
    wrapped.url = err.url;
    throw wrapped;
  });
}

export async function getProducts(search = "", page = 1, limit = 100) {
  return requestJSON("/v1/products", {
    query: { search, page, limit },
  }).catch((err) => {
    const wrapped = new Error("products failed");
    wrapped.status = err.status;
    wrapped.detail = err.detail;
    wrapped.url = err.url;
    throw wrapped;
  });
}

export async function createOrder(payload) {
  // Light client-side guard to avoid 422 from obvious mistakes
  if (!payload || typeof payload !== "object") {
    const e = new Error("order payload must be an object");
    e.status = 0;
    throw e;
  }
  // Normalize numeric fields
  if (Array.isArray(payload.items)) {
    payload = {
      ...payload,
      items: payload.items.map((i) => ({
        id: i.id,
        qty: Number(i.qty),
        price: Number(i.price),
      })),
    };
  }

  return requestJSON("/v1/orders", {
    method: "POST",
    body: payload,
  }).catch((err) => {
    const wrapped = new Error("order failed");
    wrapped.status = err.status;
    wrapped.detail = err.detail;
    wrapped.url = err.url;
    throw wrapped;
  });
}
