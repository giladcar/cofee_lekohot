"use client";

import React, { useEffect, useState } from "react";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import ThemeToggle from "./ThemeToggle";
import ContactCartBtn from "./ContactCartBtn";
import NavigateButton from "./NavigateButton";
import QuickRebook, { CartItem } from "./QuickRebook";
import ImLateButton from "./ImLateButton";
import ReviewWidget from "./ReviewWidget";

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  optionsText?: string;
  price: number;
  imageUrl?: string;
  inStock?: boolean;
}

interface MenuCategory {
  id: string;
  name: string;
  parentId: string | null;
  items?: MenuItem[];
}

interface DayHours {
  isOpen: boolean;
  open: string;
  close: string;
}

interface SettingsData {
  isCartClosed?: boolean;
  weeklyHours?: Record<string, DayHours>;
  cartPhone?: string;
  wazeLink?: string;
  announcement?: string;
  categories?: MenuCategory[];
}

interface OrderDoc {
  id: string;
  userEmail: string;
  firstName: string;
  lastName: string;
  phone: string;
  date: string;
  pickupTime: string;
  orderType?: "pickup" | "delivery";
  deliveryAddress?: string;
  items: CartItem[];
  totalPrice: number;
  status: string;
  customStatusMessage?: string;
  rating?: number;
}

export default function Lobby({
  userEmail,
  onLogout,
}: {
  userEmail: string;
  onLogout: () => void;
}) {
  const [settings, setSettings] = useState<SettingsData>({});
  const [myOrders, setMyOrders] = useState<OrderDoc[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // תהליך הזמנה
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  // חלון התאמה אישית לפריט
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [itemNote, setItemNote] = useState("");

  // שעה להיום בלבד + סוג קבלה (איסוף או משלוח)
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");

  // פרטי לקוח
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // 1. האזנה להגדרות, שעות פעילות וקטגוריות
  useEffect(() => {
    return onSnapshot(doc(db, "config", "settings"), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as SettingsData);
      }
    });
  }, []);

  // 2. טעינת פרופיל שמור של הלקוח (כולל כתובת משלוח אחרונה)
  useEffect(() => {
    return onSnapshot(doc(db, "coffee_users", userEmail), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.firstName) setFirstName(d.firstName);
        if (d.lastName) setLastName(d.lastName);
        if (d.phone) setPhone(d.phone);
        if (d.deliveryAddress) setDeliveryAddress(d.deliveryAddress);
      }
    });
  }, [userEmail]);

  // 3. הזמנות הלקוח בזמן אמת
  useEffect(() => {
    const q = query(collection(db, "orders"), where("userEmail", "==", userEmail));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc));
      list.sort((a, b) => (b.date + b.pickupTime).localeCompare(a.date + a.pickupTime));
      setMyOrders(list);
    });
  }, [userEmail]);

  const activeOrders = myOrders.filter((o) =>
    ["pending", "preparing", "ready", "out_for_delivery", "custom"].includes(o.status)
  );
  const hasCanceledByAdmin = myOrders.some((o) => o.status === "canceled_by_admin");
  const unratedOrder = myOrders.find(
    (o) => o.status === "completed" && typeof o.rating !== "number"
  );
  const lastCompletedOrder = myOrders.find((o) => o.status !== "canceled_by_admin");

  const categories = settings.categories || [];
  const currentCategory = activeCatId
    ? categories.find((c) => c.id === activeCatId) || null
    : null;
  const visibleSubCategories = categories.filter(
    (c) => (c.parentId || null) === (activeCatId || null)
  );

  const getBreadcrumbs = () => {
    const path: MenuCategory[] = [];
    let curr = currentCategory;
    while (curr) {
      path.unshift(curr);
      curr = curr.parentId ? categories.find((c) => c.id === curr!.parentId) || null : null;
    }
    return path;
  };

  const handleSelectMenuItem = (item: MenuItem) => {
    if (item.inStock === false) return;
    const opts = (item.optionsText || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (opts.length > 0) {
      setCustomizingItem(item);
      setSelectedOption(opts[0]);
      setItemNote("");
    } else {
      addToCart({
        itemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
      });
    }
  };

  const addToCart = (newItem: CartItem) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (i) =>
          i.itemId === newItem.itemId &&
          (i.customizations || "") === (newItem.customizations || "") &&
          (i.notes || "") === (newItem.notes || "")
      );
      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [...prev, newItem];
    });
    setCustomizingItem(null);
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const copy = [...prev];
      const nextQty = copy[idx].quantity + delta;
      if (nextQty <= 0) return copy.filter((_, i) => i !== idx);
      copy[idx].quantity = nextQty;
      return copy;
    });
  };

  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // חישוב שעות להיום בלבד לפי הגדרות הפעילות באדמין
  const generateTodayTimeSlots = () => {
    const now = new Date();
    const dayKey = String(now.getDay());
    const dayCfg = settings.weeklyHours?.[dayKey] || {
      isOpen: true,
      open: "07:30",
      close: "15:00",
    };

    if (!dayCfg.isOpen) return [];

    const [sh, sm] = (dayCfg.open || "07:30").split(":").map(Number);
    const [eh, em] = (dayCfg.close || "15:00").split(":").map(Number);
    let cur = sh * 60 + sm;
    const endTotal = eh * 60 + em;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const slots: string[] = [];
    while (cur < endTotal) {
      if (cur >= nowMinutes + 5) {
        const hh = String(Math.floor(cur / 60)).padStart(2, "0");
        const mm = String(cur % 60).padStart(2, "0");
        slots.push(`${hh}:${mm}`);
      }
      cur += 10;
    }
    return slots;
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !selectedTime) return;
    if (orderType === "delivery" && !deliveryAddress.trim()) return;
    setSubmitting(true);

    try {
      await setDoc(
        doc(db, "coffee_users", userEmail),
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          ...(orderType === "delivery" ? { deliveryAddress: deliveryAddress.trim() } : {}),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "orders"), {
        userEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        date: todayStr,
        pickupTime: selectedTime,
        orderType,
        deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() : "",
        items: cart,
        totalPrice,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      setCart([]);
      setSelectedTime("");
      setStep(1);
      setOrderSuccess(true);
      setSidebarOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMyOrder = async (orderId: string) => {
    if (!confirm("לבטל את ההזמנה?")) return;
    await updateDoc(doc(db, "orders", orderId), { status: "canceled" });
  };

  // תצוגת סטטוס ברורה ללקוח (מוכן / בהכנה / בדרך למשלוח / הודעת אדמין)
  const renderOrderStatusBadge = (ord: OrderDoc) => {
    if (ord.status === "custom" && ord.customStatusMessage) {
      return `💬 ${ord.customStatusMessage}`;
    }
    if (ord.status === "out_for_delivery") {
      return "🛵 המשלוח בדרך אליך!";
    }
    if (ord.status === "ready") {
      return ord.orderType === "delivery" ? "🛵 המשלוח מוכן ויוצא לדרך!" : "✅ ההזמנה שלך מוכנה!";
    }
    if (ord.status === "preparing") {
      return "☕ בהכנה כרגע";
    }
    if (ord.status === "pending") {
      return "⏳ התקבלה — ממתינה להכנה";
    }
    if (ord.status === "completed") {
      return "🤝 הושלמה";
    }
    if (ord.status === "canceled_by_admin") {
      return "❌ בוטלה ע״י המקום";
    }
    return "בוטלה";
  };

  const timeSlots = generateTodayTimeSlots();
  const canProceedToStep3 =
    Boolean(selectedTime) && (orderType === "pickup" || deliveryAddress.trim().length > 0);

  return (
    <div className="min-h-screen pb-28">
      {/* הודעה רצה בראש האתר */}
      {settings.announcement && (
        <div className="bg-amber-500 text-stone-950 text-xs sm:text-sm font-black py-2 px-4 text-center">
          📢 {settings.announcement}
        </div>
      )}

      {/* סרגל עליון */}
      <header className="sticky top-0 z-30 bg-stone-950/90 backdrop-blur border-b border-stone-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">☕</span>
            <span className="font-black text-lg text-amber-400">עגלת הקפה</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="relative px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs sm:text-sm font-black transition cursor-pointer"
            >
              🧾 ההזמנות שלי ({activeOrders.length})
              {hasCanceledByAdmin && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 animate-ping" />
              )}
            </button>
            <ContactCartBtn phone={settings.cartPhone} />
            <NavigateButton wazeLink={settings.wazeLink} />
            <ThemeToggle />
            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-red-950 text-stone-300 hover:text-red-300 border border-stone-700 text-xs sm:text-sm font-bold transition cursor-pointer"
            >
              יציאה
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* באנר התראה חי בראש הדף על הזמנה פעילה (מוכן / בדרך / הודעה מהמקום) */}
        {activeOrders.length > 0 && (
          <div className="space-y-2 mb-5">
            {activeOrders.map((ord) => {
              const isHighlighted = ["ready", "out_for_delivery", "custom"].includes(ord.status);
              return (
                <div
                  key={ord.id}
                  onClick={() => setSidebarOpen(true)}
                  className={`rounded-2xl p-4 border flex items-center justify-between gap-3 cursor-pointer transition ${
                    isHighlighted
                      ? "bg-emerald-950/60 border-emerald-500 text-emerald-100 shadow-lg"
                      : "bg-stone-900 border-amber-500/50 text-stone-100"
                  }`}
                >
                  <div>
                    <div className="text-xs text-stone-400">
                      הזמנה להיום לשעה <strong className="font-mono text-amber-400">{ord.pickupTime}</strong>{" "}
                      ({ord.orderType === "delivery" ? "משלוח" : "איסוף מהמקום"})
                    </div>
                    <div className="text-base sm:text-lg font-black mt-0.5">
                      {renderOrderStatusBadge(ord)}
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-stone-800/80 text-amber-300 shrink-0">
                    פרטים ←
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* באנר תזכורת דירוג */}
        {unratedOrder && (
          <div className="bg-stone-900 border border-amber-500 rounded-2xl p-4 mb-5 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-bold text-amber-400">⭐ נהנית מהקפה?</span>{" "}
              <span className="text-stone-300">נשמח לדירוג קצר על ההזמנה האחרונה שלך!</span>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-black text-xs cursor-pointer shrink-0"
            >
              דרג עכשיו
            </button>
          </div>
        )}

        {/* התראת עגלה סגורה */}
        {settings.isCartClosed && (
          <div className="bg-red-950/70 border border-red-700 rounded-2xl p-5 mb-6 text-center">
            <div className="text-3xl mb-1">🔴</div>
            <h2 className="font-black text-lg text-red-300">העגלה סגורה להזמנות כרגע</h2>
            <p className="text-xs text-red-200/80 mt-1">נחזור לפעילות בקרוב — נשמח לראותך!</p>
          </div>
        )}

        {/* הזמנה חוזרת מהירה */}
        {!settings.isCartClosed && step === 1 && (
          <QuickRebook
            lastOrderItems={lastCompletedOrder?.items || null}
            onQuickRebook={(items) => {
              setCart(items);
              setStep(2);
            }}
          />
        )}

        {/* אינדיקטור שלבים */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { num: 1, label: "1. בחירת תפריט" },
            { num: 2, label: "2. שעה ואופן קבלה" },
            { num: 3, label: "3. אישור הזמנה" },
          ].map((s) => (
            <button
              key={s.num}
              onClick={() => {
                if (s.num === 1) setStep(1);
                if (s.num === 2 && cart.length > 0) setStep(2);
                if (s.num === 3 && cart.length > 0 && canProceedToStep3) setStep(3);
              }}
              className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-black border transition cursor-pointer ${
                step === s.num
                  ? "bg-amber-500 text-stone-950 border-amber-400"
                  : "bg-stone-900 text-stone-400 border-stone-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* שלב 1: בחירת תפריט היררכי */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 bg-stone-900 px-3.5 py-2.5 rounded-xl border border-stone-800 text-xs">
              <button
                onClick={() => setActiveCatId(null)}
                className={`font-bold cursor-pointer ${
                  !activeCatId ? "text-amber-400" : "text-stone-300 hover:text-white"
                }`}
              >
                🏠 תפריט ראשי
              </button>
              {getBreadcrumbs().map((c) => (
                <React.Fragment key={c.id}>
                  <span className="text-stone-600">/</span>
                  <button
                    onClick={() => setActiveCatId(c.id)}
                    className={`font-bold cursor-pointer ${
                      c.id === activeCatId ? "text-amber-400" : "text-stone-300 hover:text-white"
                    }`}
                  >
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {visibleSubCategories.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {visibleSubCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCatId(cat.id)}
                    className="bg-stone-900 hover:border-amber-500 border border-stone-800 rounded-2xl p-4 text-right transition cursor-pointer shadow"
                  >
                    <div className="font-black text-base text-white">📁 {cat.name}</div>
                    <div className="text-xs text-amber-400 mt-1">כניסה לקטגוריה ←</div>
                  </button>
                ))}
              </div>
            )}

            {currentCategory && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {(currentCategory.items || []).map((item) => {
                  const out = item.inStock === false;
                  return (
                    <button
                      key={item.id}
                      disabled={out || settings.isCartClosed}
                      onClick={() => handleSelectMenuItem(item)}
                      className={`text-right p-4 rounded-2xl border flex items-center justify-between gap-3 transition ${
                        out
                          ? "bg-stone-900/40 border-stone-800 opacity-50 cursor-not-allowed"
                          : "bg-stone-900 hover:border-amber-500 border-stone-800 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-16 h-16 rounded-xl object-cover border border-stone-700 shrink-0"
                          />
                        )}
                        <div>
                          <div className="font-bold text-white text-base">{item.name}</div>
                          {item.description && (
                            <p className="text-xs text-stone-400 mt-0.5">{item.description}</p>
                          )}
                          <div className="text-[11px] text-amber-400/90 mt-1">
                            {out
                              ? "❌ אזל מהמלאי להיום"
                              : item.optionsText
                              ? `אפשרויות: ${item.optionsText}`
                              : "+ לחץ להוספה לסל"}
                          </div>
                        </div>
                      </div>
                      <div className="text-amber-400 font-black text-lg font-mono shrink-0">
                        ₪{item.price}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {categories.length === 0 && (
              <div className="text-center py-10 text-stone-400 bg-stone-900 rounded-2xl border border-stone-800">
                התפריט מתעדכן כרגע... ☕
              </div>
            )}
          </div>
        )}

        {/* שלב 2: בחירת אופן קבלה (מקום / משלוח) ושעה להיום בלבד */}
        {step === 2 && (
          <div className="space-y-6 bg-stone-900 border border-stone-800 rounded-3xl p-5">
            {/* בחירה בין לקחת במקום למשלוח */}
            <div>
              <h3 className="font-bold text-amber-400 mb-3">🛍️ איך תרצה לקבל את ההזמנה?</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrderType("pickup")}
                  className={`p-3.5 rounded-2xl border text-center transition cursor-pointer ${
                    orderType === "pickup"
                      ? "bg-amber-500 text-stone-950 border-amber-400 font-black"
                      : "bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700"
                  }`}
                >
                  <div className="text-xl mb-1">☕</div>
                  <div className="text-sm font-bold">לקחת במקום</div>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType("delivery")}
                  className={`p-3.5 rounded-2xl border text-center transition cursor-pointer ${
                    orderType === "delivery"
                      ? "bg-amber-500 text-stone-950 border-amber-400 font-black"
                      : "bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700"
                  }`}
                >
                  <div className="text-xl mb-1">🛵</div>
                  <div className="text-sm font-bold">משלוח</div>
                </button>
              </div>

              {orderType === "delivery" && (
                <div className="mt-3">
                  <label className="block text-xs text-stone-400 mb-1.5">
                    כתובת מלאה למשלוח (רחוב, מספר בית, קומה / הערות לשליח):
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="לדוגמה: הרצל 15, קומה 2, דירה 4"
                    className="w-full bg-stone-800 border border-amber-500/60 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}
            </div>

            {/* בחירת שעה להיום בלבד */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-amber-400">⏰ בחר שעה להיום ({todayStr}):</h3>
                <span className="text-xs bg-stone-800 text-amber-300 px-2.5 py-1 rounded-lg font-bold">
                  היום בלבד
                </span>
              </div>

              {timeSlots.length === 0 ? (
                <div className="text-sm text-stone-400 bg-stone-950 p-4 rounded-xl border border-stone-800 text-center">
                  אין שעות זמינות כרגע להיום (ייתכן שהעגלה סגורה להיום או ששעות הפעילות הסתיימו).
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {timeSlots.map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setSelectedTime(time)}
                      className={`py-2.5 px-2 rounded-xl border text-center font-mono transition cursor-pointer ${
                        selectedTime === time
                          ? "bg-emerald-500 text-stone-950 border-emerald-400 font-black"
                          : "bg-stone-950 hover:border-amber-500 border-stone-800 text-white"
                      }`}
                    >
                      <div className="text-base font-bold">{time}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl bg-stone-800 text-stone-300 text-sm font-bold cursor-pointer"
              >
                → חזרה לתפריט
              </button>
              <button
                type="button"
                disabled={!canProceedToStep3}
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-black text-sm cursor-pointer"
              >
                המשך לאישור ←
              </button>
            </div>
          </div>
        )}

        {/* שלב 3: פרטים ואישור */}
        {step === 3 && (
          <form
            onSubmit={handleSubmitOrder}
            className="space-y-5 bg-stone-900 border border-stone-800 rounded-3xl p-5"
          >
            <h3 className="font-black text-lg text-amber-400">🧾 סיכום ההזמנה שלך</h3>

            <div className="bg-stone-950 rounded-2xl p-4 border border-stone-800 space-y-2">
              <div className="text-xs text-stone-300 flex flex-wrap gap-2 items-center">
                <span>
                  להיום (<strong className="text-white">{todayStr}</strong>) בשעה{" "}
                  <strong className="text-amber-400 font-mono">{selectedTime}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-stone-800 text-amber-300 font-bold">
                  {orderType === "delivery"
                    ? `🛵 משלוח לכתובת: ${deliveryAddress}`
                    : "☕ לקחת במקום"}
                </span>
              </div>

              {cart.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-sm py-1 border-b border-stone-800/70"
                >
                  <div>
                    <span className="font-bold text-amber-400">{item.quantity}x </span>
                    <span className="text-white">{item.name}</span>
                    {item.customizations && (
                      <span className="text-xs text-stone-400 block">{item.customizations}</span>
                    )}
                    {item.notes && (
                      <span className="text-xs text-amber-300/80 block">הערה: {item.notes}</span>
                    )}
                  </div>
                  <span className="font-mono text-stone-300">₪{item.price * item.quantity}</span>
                </div>
              ))}
              <div className="flex justify-between font-black text-base pt-2">
                <span>סה״כ לתשלום:</span>
                <span className="text-amber-400">₪{totalPrice}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="שם פרטי"
                className="bg-stone-800 border border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="שם משפחה"
                className="bg-stone-800 border border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="טלפון נייד"
                className="bg-stone-800 border border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="flex justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2.5 rounded-xl bg-stone-800 text-stone-300 text-sm font-bold cursor-pointer"
              >
                → שנה שעה / אופן קבלה
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm cursor-pointer"
              >
                {submitting ? "שולח הזמנה..." : "✅ שלח הזמנה"}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* סל קניות צף בתחתית המסך בשלב 1 */}
      {step === 1 && cart.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-30 max-w-4xl mx-auto bg-stone-900 border border-amber-500 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-stone-400">{totalItemsCount} פריטים בסל</div>
            <div className="text-lg font-black text-amber-400 font-mono">₪{totalPrice}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCart([])}
              className="px-3 py-2 rounded-xl bg-stone-800 text-stone-400 text-xs font-bold cursor-pointer"
            >
              רוקן
            </button>
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm cursor-pointer"
            >
              בחר שעה ומשלוח / איסוף ←
            </button>
          </div>
        </div>
      )}

      {/* חלון בחירת אפשרויות לפריט */}
      {customizingItem && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setCustomizingItem(null)}
        >
          <div
            className="bg-stone-900 border border-stone-700 rounded-3xl p-6 max-w-sm w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-amber-400">
              {customizingItem.name} — בחר אפשרות
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(customizingItem.optionsText || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelectedOption(opt)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                      selectedOption === opt
                        ? "bg-amber-500 text-stone-950 border-amber-400"
                        : "bg-stone-800 text-stone-300 border-stone-700"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
            </div>
            <input
              type="text"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="הערה נוספת לבריסטה (לא חובה)..."
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <button
              onClick={() =>
                addToCart({
                  itemId: customizingItem.id,
                  name: customizingItem.name,
                  price: customizingItem.price,
                  quantity: 1,
                  customizations: selectedOption,
                  notes: itemNote.trim(),
                })
              }
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm cursor-pointer"
            >
              הוסף לסל (₪{customizingItem.price})
            </button>
          </div>
        </div>
      )}

      {/* סרגל צד: ההזמנות שלי */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex justify-end"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="w-full max-w-md bg-stone-900 h-full overflow-y-auto p-5 space-y-4 border-r border-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h2 className="text-lg font-black text-amber-400">🧾 ההזמנות שלי</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="px-3 py-1 rounded-lg bg-stone-800 text-stone-300 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {orderSuccess && (
              <div className="bg-emerald-950/70 border border-emerald-600 rounded-2xl p-3 text-xs text-emerald-200 font-bold text-center">
                🎉 ההזמנה התקבלה! תקבל כאן עדכון חי כשהיא בהכנה, מוכנה או בדרך אליך.
              </div>
            )}

            {cart.length > 0 && (
              <div className="bg-stone-950 border border-amber-500/40 rounded-2xl p-3 space-y-2">
                <div className="text-xs font-bold text-amber-400">🛒 פריטים בסל הנוכחי:</div>
                {cart.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span>
                      {c.name} {c.customizations ? `(${c.customizations})` : ""}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateCartQty(idx, -1)}
                        className="px-2 py-0.5 bg-stone-800 rounded cursor-pointer"
                      >
                        -
                      </button>
                      <span>{c.quantity}</span>
                      <button
                        onClick={() => updateCartQty(idx, 1)}
                        className="px-2 py-0.5 bg-stone-800 rounded cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {myOrders.length === 0 ? (
              <p className="text-center text-stone-400 text-sm py-10">עדיין לא ביצעת הזמנות ☕</p>
            ) : (
              myOrders.map((ord) => {
                const isActive = [
                  "pending",
                  "preparing",
                  "ready",
                  "out_for_delivery",
                  "custom",
                ].includes(ord.status);
                const isReadyOrDelivery = ["ready", "out_for_delivery", "custom"].includes(
                  ord.status
                );
                return (
                  <div
                    key={ord.id}
                    className={`rounded-2xl p-4 border space-y-2.5 ${
                      isReadyOrDelivery
                        ? "bg-emerald-950/30 border-emerald-500"
                        : "bg-stone-950 border-stone-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-amber-400 text-xs">
                        {ord.date} | {ord.pickupTime}
                      </span>
                      <span
                        className={`text-xs font-black px-2.5 py-1 rounded-full ${
                          isReadyOrDelivery
                            ? "bg-emerald-500 text-stone-950"
                            : "bg-stone-800 text-white"
                        }`}
                      >
                        {renderOrderStatusBadge(ord)}
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-400">
                      {ord.orderType === "delivery"
                        ? `🛵 משלוח לכתובת: ${ord.deliveryAddress || "לא צוינה כתובת"}`
                        : "☕ לקחת במקום"}
                    </div>

                    <div className="text-xs text-stone-300 space-y-1">
                      {(ord.items || []).map((it, i) => (
                        <div key={i}>
                          • {it.quantity}x {it.name}{" "}
                          {it.customizations ? `(${it.customizations})` : ""}
                        </div>
                      ))}
                    </div>

                    <div className="text-xs font-bold text-amber-400">סה״כ: ₪{ord.totalPrice}</div>

                    {isActive && (
                      <div className="space-y-2 pt-1">
                        <ImLateButton
                          orderId={ord.id}
                          firstName={ord.firstName}
                          pickupTime={ord.pickupTime}
                        />
                        {ord.status === "pending" && (
                          <button
                            onClick={() => handleCancelMyOrder(ord.id)}
                            className="w-full py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 text-red-300 text-xs font-bold cursor-pointer"
                          >
                            ביטול הזמנה
                          </button>
                        )}
                      </div>
                    )}

                    {ord.status === "completed" && typeof ord.rating !== "number" && (
                      <ReviewWidget orderId={ord.id} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}