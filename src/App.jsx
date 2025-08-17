import React, { useEffect, useMemo, useState } from "react";
import { getRepMe, getProducts, createOrder } from "./api";
import "./App.css";

/* ===== Утилиты ===== */
const KZT = new Intl.NumberFormat("ru-KZ", {
  style: "currency",
  currency: "KZT",
  maximumFractionDigits: 0,
});
const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const fuzzyIncludes = (hay, needle) =>
  !needle || (hay || "").toString().toLowerCase().includes(needle.toString().toLowerCase());

function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

/** Гибридная функция:
 *  1) Боевой режим: Telegram WebApp user.id
 *  2) Dev/браузер: ?tid=ВАШ_TELEGRAM_ID
 *  3) Иначе — null (аккуратная ошибка)
 */
function resolveTelegramId() {
  const tg = window.Telegram?.WebApp;
  const tidFromTG = tg?.initDataUnsafe?.user?.id;
  if (tidFromTG) return String(tidFromTG);

  const urlTid = new URLSearchParams(window.location.search).get("tid");
  if (urlTid) return String(urlTid);

  return null;
}

/* ===== Компоненты ===== */

function StorePicker({ stores, value, onChange }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      (stores || []).filter(
        (s) =>
          fuzzyIncludes(s.name, q) ||
          fuzzyIncludes(s.address, q) ||
          fuzzyIncludes(s.bin_iin, q) ||
          fuzzyIncludes(s.phone, q)
      ),
    [stores, q]
  );

  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600">Магазин</label>
      <input
        placeholder="Поиск: название, адрес, BIN/ИИН, телефон"
        className="w-full rounded-xl border p-3"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="w-full rounded-xl border p-3 focus:outline-none focus:ring"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Выберите из {filtered.length} найденных
        </option>
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.address}
          </option>
        ))}
      </select>
      {value && (
        <div className="text-xs text-gray-500">
          {(stores || []).find((s) => s.id === value)?.phone} • BIN/ИИН:{" "}
          {(stores || []).find((s) => s.id === value)?.bin_iin || "—"}
        </div>
      )}
    </div>
  );
}

const ProductFilters = ({ cat, setCat, categories }) => (
  <div className="flex flex-wrap items-center gap-2">
    {categories.map((c) => (
      <button
        key={c}
        onClick={() => setCat(c)}
        className={`rounded-xl border px-3 py-1 text-sm ${
          c === cat ? "bg-black text-white" : "bg-gray-100 text-gray-900 border-gray-200"
        }`}
      >
        {c}
      </button>
    ))}
  </div>
);

const ProductSearch = ({ q, setQ }) => (
  <input
    placeholder="Найти товар: название или SKU"
    className="w-full rounded-xl border p-3"
    value={q}
    onChange={(e) => setQ(e.target.value)}
  />
);

function ProductCard({ p, onAdd }) {
  const fallback = "https://dummyimage.com/120x120/eaeaea/000&text=No+Image";
  return (
    <div className="flex items-center gap-3 rounded-2xl border p-3 shadow-sm">
      <img
        src={p.image_url || p.img || fallback}
        alt={p.title}
        className="h-16 w-16 rounded-xl object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate" title={p.title}>
          {p.title}
        </div>
        <div className="text-xs text-gray-500">
          SKU: {p.sku} • {p.unit} • {p.category || "—"}
        </div>
        <div className="mt-1 font-semibold">{KZT.format(Number(p.price || 0))}</div>
      </div>
      <div className="flex items-center gap-2">
        <button className="rounded-xl border px-2 py-1" onClick={() => onAdd(p, 1)}>
          +1
        </button>
        <button className="rounded-xl border px-2 py-1" onClick={() => onAdd(p, 5)}>
          +5
        </button>
        {Number(p.pack_size) > 1 && (
          <button
            className="rounded-xl border px-2 py-1"
            onClick={() => onAdd(p, Number(p.pack_size))}
          >
            Упаковка
          </button>
        )}
      </div>
    </div>
  );
}

function CartRow({ item, onQty, onRemove }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2">
      <div className="sm:col-span-5 min-w-0">
        <div className="truncate font-medium" title={item.title}>
          {item.title}
        </div>
        <div className="text-xs text-gray-500 sm:hidden">SKU: {item.sku}</div>
      </div>
      <div className="hidden sm:block sm:col-span-2 text-sm text-gray-500">{item.sku}</div>
      <div className="sm:col-span-3 flex items-center gap-2">
        <button
          className="rounded-lg border px-3 py-2"
          onClick={() => onQty(item.id, Math.max(1, item.qty - 1))}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={item.qty}
          onChange={(e) => onQty(item.id, Math.max(1, Number(e.target.value) || 1))}
          className="w-20 min-w-[5rem] rounded-lg border p-2 text-center"
        />
        <button className="rounded-lg border px-3 py-2" onClick={() => onQty(item.id, item.qty + 1)}>
          +
        </button>
      </div>
      <div className="sm:col-span-2 text-right font-medium">
        {KZT.format(Number(item.price) * Number(item.qty))}
      </div>
      <div className="sm:col-span-0 sm:text-right">
        <button className="text-red-500 hover:underline" onClick={() => onRemove(item.id)}>
          Убрать
        </button>
      </div>
    </div>
  );
}

function PaymentModal({ open, total, onClose, onPaid }) {
  const [method, setMethod] = useState("Cash");
  const [txn, setTxn] = useState("");

  useEffect(() => {
    if (!open) {
      setMethod("Cash");
      setTxn("");
    }
  }, [open]);

  if (!open) return null;

  const methods = [
    { key: "Cash", label: "Наличные" },
    { key: "Card", label: "Карта" },
    { key: "QR", label: "QR" },
    { key: "Kaspi", label: "Счёт Kaspi" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 text-lg font-semibold">Оплата — {KZT.format(total)}</div>
        <div className="space-y-3">
          <label className="block text-sm">Метод оплаты</label>
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`rounded-xl border px-3 py-2 transition ${
                  method === m.key
                    ? "bg-black text-white border-black"
                    : "bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Номер транзакции / чек (опц.)</label>
            <input
              value={txn}
              onChange={(e) => setTxn(e.target.value)}
              placeholder="напр. KZ12345"
              className="w-full rounded-xl border p-3"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button className="flex-1 rounded-xl border px-4 py-3" onClick={onClose}>
            Отмена
          </button>
          <button
            className="flex-1 rounded-xl bg-black px-4 py-3 text-white"
            onClick={() => onPaid({ method, txn })}
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== Главный компонент ===== */

export default function App() {
  // корректная инициализация Telegram WebApp API
  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.setHeaderColor?.("#ffffff");
    } catch {}
  }, []);

  const [appKey, setAppKey] = useState(0);
  const [selectedStore, setSelectedStore] = useLocalState("idistr.store", "");
  const [recentIds, setRecentIds] = useLocalState("idistr.recents", []);
  const [cart, setCart] = useLocalState("idistr.cart", []);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Все");
  const [openPay, setOpenPay] = useState(false);

  // Данные с API
  const [rep, setRep] = useState(null); // оставляем; может пригодиться в UI
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [telegramId, setTelegramId] = useState(null);

  const CATEGORIES = useMemo(
    () => ["Все", ...Array.from(new Set((products || []).map((p) => p.category).filter(Boolean)))],
    [products]
  );

  const filteredProducts = useMemo(
    () =>
      (products || []).filter(
        (p) =>
          (cat === "Все" || p.category === cat) &&
          (fuzzyIncludes(p.title, q) || fuzzyIncludes(p.sku, q))
      ),
    [products, q, cat]
  );

  const total = useMemo(
    () => cart.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0),
    [cart]
  );

  useEffect(() => {
    (async () => {
      try {
        setFatal("");

        const tid = resolveTelegramId();
        if (!tid) {
          setFatal(
            "Откройте мини-приложение в Telegram (синяя кнопка) или добавьте ?tid=ВАШ_TELEGRAM_ID в адресную строку."
          );
          setLoading(false);
          return;
        }
        setTelegramId(tid);

        const repData = await getRepMe(tid);
        setRep(repData.rep || null);
        setStores(repData.stores || []);

        const { items } = await getProducts("");
        setProducts(items || []);
      } catch (e) {
        console.error(e);
        if (e?.message === "reps/me failed") {
          setFatal("ТП с таким telegram_id не найден в таблице sales_reps. Проверьте значение.");
        } else {
          setFatal("Ошибка загрузки данных. Проверьте Sheets-доступ и CORS_ORIGIN.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Миграция: если в старых данных корзины нет id, восстановим его по sku/названию
  useEffect(() => {
    if (!products || products.length === 0) return;
    setCart((old) =>
      old.map((x) => {
        if (x?.id) return x;
        const p = products.find((p) => p.sku === x.sku || p.title === x.title);
        return p ? { ...x, id: p.id } : x;
      })
    );
  }, [products]);

  const pushRecent = (id) =>
    setRecentIds((old) => [id, ...old.filter((x) => x !== id)].slice(0, 10));

  function addToCart(p, qty = 1) {
    pushRecent(p.id);
    setCart((old) => {
      const exists = old.find((x) => x.id === p.id);
      if (exists) return old.map((x) => (x.id === p.id ? { ...x, qty: x.qty + qty } : x));
      return [
        ...old,
        {
          id: p.id,
          title: p.title,
          price: Number(p.price),
          sku: p.sku,
          qty,
        },
      ];
    });
  }

  const updateQty = (id, qty) => setCart((old) => old.map((x) => (x.id === id ? { ...x, qty } : x)));
  const removeItem = (id) => setCart((old) => old.filter((x) => x.id !== id));
  const resetAll = () => {
    setCart([]);
    setNote("");
  };

  function issueReceipt({ payment }) {
    if (payment.method !== "Cash") return; // печать только для наличных
    const store = (stores || []).find((s) => s.id === selectedStore);
    const orderId = `ORD-${uid()}`;
    const now = new Date();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${orderId}</title>
<style>body{font-family:ui-sans-serif,-apple-system,system-ui;padding:20px}h1{font-size:20px;margin:0 0 10px}.muted{color:#666}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border-bottom:1px solid #eee;padding:8px;text-align:left;font-size:12px}.right{text-align:right}.foot{margin-top:16px;font-size:12px}.badge{display:inline-block;padding:2px 8px;border:1px solid #000;border-radius:999px;font-size:11px}</style>
</head><body>
<h1>ТОВАРНЫЙ ЧЕК <span class="badge">${orderId}</span></h1>
<div class="muted">${now.toLocaleString("ru-KZ")} — ${store?.name ?? "Магазин"}</div>
<div class="muted">Контакты: ${store?.phone ?? "—"} • BIN/ИИН: ${store?.bin_iin || "—"}</div>
<table><thead><tr><th>#</th><th>Товар</th><th>SKU</th><th>Кол-во</th><th class="right">Цена</th><th class="right">Сумма</th></tr></thead><tbody>
${cart
  .map(
    (i, idx) =>
      `<tr><td>${idx + 1}</td><td>${i.title}</td><td>${i.sku}</td><td>${i.qty}</td><td class="right">${
        i.price
      }</td><td class="right">${i.price * i.qty}</td></tr>`
  )
  .join("")}
</tbody><tfoot><tr><th colspan="5" class="right">Итого</th><th class="right">${total}</th></tr></tfoot></table>
<div class="foot">Метод оплаты: ${payment.method}${payment.txn ? ` • Чек: ${payment.txn}` : ""}</div>
${note ? `<div class="foot">Примечание: ${note}</div>` : ""}
<script>window.print()</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  async function confirmOrder(payment) {
    if (!selectedStore || cart.length === 0) return;
    if (!telegramId) {
      alert("Не найден telegram_id. Откройте в Telegram или добавьте ?tid=ВАШ_TELEGRAM_ID в адрес.");
      return;
    }

    // Нормализуем позиции: гарантируем наличие id у каждого товара
    const normalizedItems = cart.map((i) => {
      const foundId =
        i.id ||
        (products || []).find((p) => p.sku === i.sku || p.title === i.title)?.id;
      return {
        id: foundId,
        qty: Number(i.qty),
        price: Number(i.price),
      };
    });

    // Если у какой-то позиции так и нет id — просим пере-добавить
    const broken = normalizedItems.find((x) => !x.id);
    if (broken) {
      alert("Не удалось определить ID для одного из товаров. Удалите его из корзины и добавьте заново.");
      return;
    }

    const payload = {
      telegram_id: telegramId,
      store_id: selectedStore,
      items: normalizedItems,
      payment: { method: payment.method, txn: payment.txn || "" },
      note,
    };

    try {
      const res = await createOrder(payload);
      issueReceipt({ payment });
      setOpenPay(false);
      resetAll();
      alert(`Заказ создан: ${res.order_id}`);
    } catch (e) {
      console.error("createOrder failed", e);
      alert("Ошибка создания заказа");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Загрузка данных…</div>;
  }

  if (fatal) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border p-4">
          <div className="text-red-600 font-semibold mb-2">Нужно действие</div>
          <div className="text-sm">{fatal}</div>
        </div>
      </div>
    );
  }

  return (
    <div key={appKey} className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">IDISTR — Mini-App (MVP)</div>
          <div className="text-sm text-gray-500">
            Быстрый сбор заказов • Фиксация оплаты • Печать чека (нал.)
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-2xl border px-3 py-1 text-xs hover:bg-gray-50"
            onClick={() => {
              try {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith("idistr."))
                  .forEach((k) => localStorage.removeItem(k));
              } catch {}
              setAppKey((x) => x + 1);
            }}
            title="Очистить локальные данные и перезапустить превью"
          >
            Сброс демо
          </button>
          <div className="rounded-2xl border px-3 py-1 text-xs">DEMO</div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Левая колонка: магазин + каталог */}
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-2xl border p-4">
            <StorePicker stores={stores} value={selectedStore} onChange={setSelectedStore} />
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Каталог</h2>
            <div className="text-xs text-gray-500">Товары: {products.length}</div>
          </div>

          <div className="rounded-2xl border p-4 space-y-3">
            <ProductSearch q={q} setQ={setQ} />
            <ProductFilters cat={cat} setCat={setCat} categories={CATEGORIES} />
          </div>

          {recentIds.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Недавние</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {recentIds
                  .map((id) => (products || []).find((p) => p.id === id))
                  .filter(Boolean)
                  .map((p) => (
                    <ProductCard key={p.id} p={p} onAdd={addToCart} />
                  ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredProducts.map((p) => (
              <ProductCard key={p.id} p={p} onAdd={addToCart} />
            ))}
          </div>
        </div>

        {/* Правая колонка: корзина */}
        <div className="space-y-4">
          <div className="rounded-2xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Корзина</h2>
              {cart.length > 0 && (
                <button className="text-xs text-gray-500 hover:underline" onClick={resetAll}>
                  Очистить
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="text-sm text-gray-500">Добавьте товары из каталога</div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <CartRow key={item.id} item={item} onQty={updateQty} onRemove={removeItem} />
                ))}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <label className="block text-sm text-gray-600">Примечание</label>
              <textarea
                className="h-20 w-full resize-none rounded-xl border p-3"
                placeholder="Комментарий к заказу"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="mt-4 border-t pt-4">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Итого</span>
                <span className="text-base font-semibold">{KZT.format(total)}</span>
              </div>
              <button
                disabled={!selectedStore || cart.length === 0}
                onClick={() => setOpenPay(true)}
                className="mt-3 w-full rounded-2xl bg-black px-4 py-3 text-white disabled:opacity-40"
              >
                Перейти к оплате
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Подтверждение создаёт запись в Google Sheets через бэкенд. Чек печатается только для
                «Наличные».
              </p>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-gray-400">
        © 2025 IDISTR demo • Боевой режим (данные из Google Sheets)
      </footer>

      <PaymentModal open={openPay} total={total} onClose={() => setOpenPay(false)} onPaid={confirmOrder} />
    </div>
  );
}