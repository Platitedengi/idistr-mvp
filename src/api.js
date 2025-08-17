// src/api.js

// Prefer VITE_API_BASE, fallback to VITE_API_URL for compatibility.
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  "";

// Optional verbose logging controlled via env
const DEBUG_API = String(import.meta.env.VITE_DEBUG_API || "").toLowerCase() === "true";

/**
 * Ensure API is configured at build time.
 */
function assertApiBase() {
  if (!API_BASE) {
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

  // Build absolute URL safely regardless of leading slash
  const url = new URL(path, API_BASE);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }

  const init = { method, headers: { Accept: "application/json" } };

  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json"; // FastAPI expects this
    init.body = JSON.stringify(body);
  }

  if (DEBUG_API) {
    // eslint-disable-next-line no-console
    console.log(`[API → ${method}]`, url.toString(), body ?? "");
  }

  const res = await fetch(url.toString(), init);

  if (DEBUG_API) {
    // eslint-disable-next-line no-console
    console.log(`[API ← ${res.status}]`, url.pathname);
  }

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
    if (DEBUG_API) {
      // eslint-disable-next-line no-console
      console.error("[API ERROR]", err);
    }
    throw err;
  }

  // Some endpoints (204) have no JSON
  if (res.status === 204) return {};
  return res.json();
}

// --- Public API wrappers ----------------------------------------------------

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

// Helper to normalize and validate order payload to avoid 422
function normalizeOrderPayload(input) {
  if (!input || typeof input !== "object") {
    throw Object.assign(new Error("order payload must be an object"), { status: 0 });
  }

  const out = { ...input };

  // Normalize telegram_id & store_id to strings (backend usually accepts str)
  if (out.telegram_id !== undefined) out.telegram_id = String(out.telegram_id);
  if (out.store_id !== undefined) out.store_id = String(out.store_id);

  if (Array.isArray(out.items)) {
    out.items = out.items.map((i) => ({
      id: i.id, // keep as-is (can be SKU string or numeric id)
      qty: Number(i.qty),
      price: Number(i.price),
    }));
  }

  if (!out.items || !out.items.length) {
    throw Object.assign(new Error("order must contain at least 1 item"), { status: 0 });
  }

  // payment normalization
  if (out.payment && typeof out.payment === "object") {
    out.payment = {
      method: String(out.payment.method || ""),
      txn: out.payment.txn ? String(out.payment.txn) : "",
    };
  }

  return out;
}

export async function createOrder(payload) {
  const body = normalizeOrderPayload(payload);

  return requestJSON("/v1/orders", {
    method: "POST",
    body,
  }).catch((err) => {
    const wrapped = new Error("order failed");
    wrapped.status = err.status;
    wrapped.detail = err.detail;
    wrapped.url = err.url;
    throw wrapped;
  });
}
