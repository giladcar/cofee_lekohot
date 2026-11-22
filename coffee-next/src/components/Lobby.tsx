"use client";

import React, { useEffect, useRef, useState } from "react";
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

interface SettingsData {
  isCartClosed?: boolean;
  cartPhone?: string;
  wazeLink?: string;
  bitLink?: string;
  payboxLink?: string;
  announcement?: string;
  showPublicRating?: boolean;
  publicRatingAverage?: string;
  publicRatingCount?: number;
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
  const [ordersTab, setOrdersTab] = useState<"active" | "past">("active");

  // התראות בטלפון
  const [notifEnabled, setNotifEnabled] = useState(false);
  const prevStatusesRef = useRef<Record<string, string>>({});

  // מודאל דירוג נפרד
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSending, setRatingSending] = useState(false);
  const [ratingSentSuccess, setRatingSentSuccess] = useState(false);

  // תהליך הזמנה ותצוגת תפריט
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCatId, setSelectedCatId] = useState<string>("ALL");
  const [cart, setCart] = useState<CartItem[]>([]);

  // חלון התאמה אישית לפריט
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [itemNote, setItemNote] = useState("");

  // אופן קבלה (איסוף או משלוח + כתובת)
  const todayStr = new Date().toISOString().split("T")[0];
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");

  // פרטי לקוח
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifEnabled(Notification.permission === "granted");
    }
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, "config", "settings"), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as SettingsData);
      }
    });
  }, []);

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

  useEffect(() => {
    const q = query(collection(db, "orders"), where("userEmail", "==", userEmail));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc));
      list.sort((a, b) =>
        (b.date + (b.pickupTime || "")).localeCompare(a.date + (a.pickupTime || ""))
      );
      setMyOrders(list);
    });
  }, [userEmail]);

  const sendSafeNotification = async (title: string, body: string) => {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      if ("serviceWorker" in navigator) {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register("/sw.js");
        }
        await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: "/apple-icon",
            badge: "/icon",
            vibrate: [200, 100, 200],
          } as NotificationOptions);
          return;
        }
      }
      new Notification(title, { body });
    } catch {
      // מונע קריסת דפדפן באנדרואיד
    }
  };

  const requestPhoneNotifications = async () => {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        alert("התראות הדפדפן אינן נתמכות במכשיר זה.");
        return;
      }
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js");
      }
      const perm = await Notification.requestPermission();
      setNotifEnabled(perm === "granted");
      if (perm === "granted") {
        await sendSafeNotification(
          "☕ עגלת הקפה",
          "התראות הופעלו! נעדכן אותך מיד כשההזמנה מוכנה או בדרך."
        );
      } else {
        alert("יש לאשר התראות בהגדרות הדפדפן עבור אתר זה.");
      }
    } catch {
      alert("לא ניתן להפעיל התראות בדפדפן זה.");
    }
  };
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

  useEffect(() => {
    myOrders.forEach((ord) => {
      const prev = prevStatusesRef.current[ord.id];
      const currentKey = `${ord.status}:${ord.customStatusMessage || ""}`;
      if (prev && prev !== currentKey) {
        const msg = renderOrderStatusBadge(ord);
        sendSafeNotification("☕ עדכון בהזמנה שלך!", msg);
      }
      prevStatusesRef.current[ord.id] = currentKey;
    });
  }, [myOrders]);

  const activeStatuses = ["pending", "preparing", "ready", "out_for_delivery", "custom"];
  const activeOrders = myOrders.filter((o) => activeStatuses.includes(o.status));
  const pastOrders = myOrders.filter((o) => !activeStatuses.includes(o.status));
  const hasCanceledByAdmin = myOrders.some((o) => o.status === "canceled_by_admin");
  const lastCompletedOrder = myOrders.find((o) => o.status !== "canceled_by_admin");

  const categories = settings.categories || [];
  const getCategoryDisplayName = (cat: MenuCategory) => {
    if (!cat.parentId) return cat.name;
    const parent = categories.find((p) => p.id === cat.parentId);
    return parent ? `${parent.name} — ${cat.name}` : cat.name;
  };
  

  const categoriesWithItems = categories;
  const displayedSections =
    selectedCatId === "ALL"
      ? categoriesWithItems
      : categoriesWithItems.filter(
          (c) => c.id === selectedCatId || c.parentId === selectedCatId
        );

  const handleSelectMenuItem = (item: MenuItem) => {
    if (item.inStock === false || settings.isCartClosed) return;
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

  const getItemQtyInCart = (itemId: string) =>
    cart.filter((c) => c.itemId === itemId).reduce((sum, c) => sum + c.quantity, 0);

  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    if (orderType === "delivery" && !deliveryAddress.trim()) return;
    setSubmitting(true);

    const nowTime = new Date().toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });

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
        pickupTime: nowTime,
        orderType,
        deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() : "",
        items: cart,
        totalPrice,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      setCart([]);
      setStep(1);
      setOrderSuccess(true);
      setOrdersTab("active");
      setSidebarOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMyOrder = async (orderId: string) => {
    if (!confirm("לבטל את ההזמנה?")) return;
    await updateDoc(doc(db, "orders", orderId), { status: "canceled" });
  };

  const handleSendReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setRatingSending(true);
    try {
      await addDoc(collection(db, "reviews"), {
        userEmail,
        firstName: firstName.trim() || userEmail.split("@")[0],
        lastName: lastName.trim(),
        rating: ratingStars,
        comment: ratingComment.trim(),
        createdAt: new Date().toISOString(),
      });
      setRatingSentSuccess(true);
      setRatingComment("");
      setTimeout(() => {
        setRatingModalOpen(false);
        setRatingSentSuccess(false);
      }, 1500);
    } finally {
      setRatingSending(false);
    }
  };

  const canProceedToStep3 =
    orderType === "pickup" || deliveryAddress.trim().length > 0;

  const displayedOrdersList = ordersTab === "active" ? activeOrders : pastOrders;

  return (
    <div className="min-h-screen pb-28 bg-stone-950 text-stone-100">
    {/* הודעה רצה בראש האתר */}
      {settings.announcement && (
        <div className="bg-amber-500 text-stone-950 text-xs sm:text-sm font-black py-2 px-4 text-center">
          📢 {settings.announcement}
        </div>
      )}

      {/* באנר דירוג לקוחות מפורסם */}
      {settings.showPublicRating && (
        <div
          onClick={() => setRatingModalOpen(true)}
          className="bg-stone-900 border-b border-amber-500/40 py-2 px-4 text-center text-xs sm:text-sm cursor-pointer hover:bg-stone-800 transition"
        >
          <span className="text-amber-400 font-black">
            ★ {settings.publicRatingAverage || "5.0"}
          </span>{" "}
          <span className="text-stone-200">
            דירוג הלקוחות שלנו ({settings.publicRatingCount || 1} ביקורות) •{" "}
          </span>
          <span className="text-amber-400 underline font-bold">דרג גם אתה</span>
        </div>
      )}
      {/* סרגל עליון */}
      <header className="sticky top-0 z-30 bg-stone-950/90 backdrop-blur border-b border-stone-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">☕</span>
            <div>
              <span className="font-black text-lg text-amber-400 block leading-none">
                עגלת הקפה
              </span>
              <span className="text-[11px] text-stone-400">תפריט טרי ומהיר</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                setOrdersTab("active");
                setSidebarOpen(true);
              }}
              className="relative px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs sm:text-sm font-black transition cursor-pointer"
            >
              🧾 ההזמנות שלי ({activeOrders.length})
              {hasCanceledByAdmin && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 animate-ping" />
              )}
            </button>
            <button
              onClick={() => setRatingModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs sm:text-sm font-bold transition cursor-pointer"
            >
              ⭐ דרג אותנו
            </button>
            <button
              onClick={requestPhoneNotifications}
              className={`px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition cursor-pointer ${
                notifEnabled
                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-700"
                  : "bg-stone-800 hover:bg-amber-500/20 text-amber-400 border-amber-500/40"
              }`}
            >
              {notifEnabled ? "🔔 התראות פעילות" : "🔕 הפעל התראות"}
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
        {/* באנר התראה חי בראש הדף על הזמנה פעילה */}
        {activeOrders.length > 0 && (
          <div className="space-y-2 mb-5">
            {activeOrders.map((ord) => {
              const isHighlighted = ["ready", "out_for_delivery", "custom"].includes(ord.status);
              return (
                <div
                  key={ord.id}
                  onClick={() => {
                    setOrdersTab("active");
                    setSidebarOpen(true);
                  }}
                  className={`rounded-2xl p-4 border flex items-center justify-between gap-3 cursor-pointer transition ${
                    isHighlighted
                      ? "bg-emerald-950/60 border-emerald-500 text-emerald-100 shadow-lg"
                      : "bg-stone-900 border-amber-500/50 text-stone-100"
                  }`}
                >
                  <div>
                    <div className="text-xs text-stone-400">
                      הזמנה ({ord.orderType === "delivery" ? "משלוח" : "לקחת במקום"})
                      {ord.pickupTime ? ` • ${ord.pickupTime}` : ""}
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
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { num: 1, label: "1. תפריט" },
            { num: 2, label: "2. משלוח / במקום" },
            { num: 3, label: "3. סיכום ואישור" },
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

        {/* שלב 1: תפריט בית קפה אמיתי עם לשוניות קטגוריות וכרטיסי מנות עשירים */}
        {step === 1 && (
          <div className="space-y-6">
            {categoriesWithItems.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                <button
                  onClick={() => setSelectedCatId("ALL")}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-black whitespace-nowrap border transition cursor-pointer ${
                    selectedCatId === "ALL"
                      ? "bg-amber-500 text-stone-950 border-amber-400 shadow-md"
                      : "bg-stone-900 text-stone-300 border-stone-800 hover:border-stone-700"
                  }`}
                >
                  🍽️ כל התפריט
                </button>
                {categoriesWithItems.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCatId(cat.id)}
                    className={`px-4 py-2 rounded-full text-xs sm:text-sm font-black whitespace-nowrap border transition cursor-pointer ${
                      selectedCatId === cat.id
                        ? "bg-amber-500 text-stone-950 border-amber-400 shadow-md"
                        : "bg-stone-900 text-stone-300 border-stone-800 hover:border-stone-700"
                    }`}
                  >
                    {getCategoryDisplayName(cat)}
                  </button>
                ))}
              </div>
            )}

            {displayedSections.map((section) => (
              <section key={section.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg sm:text-xl font-black text-amber-400">
                    {getCategoryDisplayName(section)}
                  </h2>
                  <div className="h-px flex-1 bg-stone-800" />
                </div>
{(section.items || []).length === 0 ? (
  <div className="text-xs text-stone-500 bg-stone-900/50 border border-stone-800/70 rounded-2xl p-4 text-center">
    אין פריטים בקטגוריה זו כרגע ☕
  </div>
) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {(section.items || []).map((item) => {
                    const out = item.inStock === false;
                    const qtyInCart = getItemQtyInCart(item.id);

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectMenuItem(item)}
                        className={`group rounded-2xl border p-3.5 flex items-center justify-between gap-3.5 transition ${
                          out
                            ? "bg-stone-900/40 border-stone-800/60 opacity-50 cursor-not-allowed"
                            : qtyInCart > 0
                            ? "bg-stone-900 border-amber-500/80 shadow-lg cursor-pointer"
                            : "bg-stone-900/90 hover:bg-stone-900 hover:border-amber-500/60 border-stone-800 cursor-pointer"
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-white text-base truncate">
                              {item.name}
                            </h3>
                            {qtyInCart > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-stone-950 text-[11px] font-black">
                                {qtyInCart} בסל
                              </span>
                            )}
                          </div>

                          {item.description && (
                            <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}

                          {item.optionsText && !out && (
                            <div className="text-[11px] text-stone-400">
                              ✨ התאמה אישית:{" "}
                              <span className="text-stone-300">{item.optionsText}</span>
                            </div>
                          )}

                          <div className="pt-1.5 flex items-center justify-between">
                            <span className="text-amber-400 font-black text-base font-mono">
                              ₪{item.price}
                            </span>

                            {out ? (
                              <span className="text-xs font-bold text-red-400">אזל להיום</span>
                            ) : (
                              <span className="px-3 py-1 rounded-xl bg-amber-500/15 group-hover:bg-amber-500 text-amber-400 group-hover:text-stone-950 text-xs font-black transition">
                                + הוסף
                              </span>
                            )}
                          </div>
                        </div>

                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-24 h-24 rounded-2xl object-cover border border-stone-700/80 shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-2xl bg-stone-800/70 border border-stone-800 flex items-center justify-center text-2xl shrink-0">
                            ☕
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
				)}
              </section>
            ))}

            {categoriesWithItems.length === 0 && (
              <div className="text-center py-12 text-stone-400 bg-stone-900 rounded-2xl border border-stone-800">
                התפריט מתעדכן כרגע... ☕
              </div>
            )}
          </div>
        )}

        {/* שלב 2: בחירה בין לקחת במקום למשלוח (+ כתובת) */}
        {step === 2 && (
          <div className="space-y-6 bg-stone-900 border border-stone-800 rounded-3xl p-5">
            <div>
              <h3 className="font-bold text-amber-400 mb-3">🛍️ איך תרצה לקבל את ההזמנה?</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrderType("pickup")}
                  className={`p-4 rounded-2xl border text-center transition cursor-pointer ${
                    orderType === "pickup"
                      ? "bg-amber-500 text-stone-950 border-amber-400 font-black"
                      : "bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700"
                  }`}
                >
                  <div className="text-2xl mb-1">☕</div>
                  <div className="text-base font-bold">לקחת במקום</div>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType("delivery")}
                  className={`p-4 rounded-2xl border text-center transition cursor-pointer ${
                    orderType === "delivery"
                      ? "bg-amber-500 text-stone-950 border-amber-400 font-black"
                      : "bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700"
                  }`}
                >
                  <div className="text-2xl mb-1">🛵</div>
                  <div className="text-base font-bold">משלוח</div>
                </button>
              </div>

              {orderType === "delivery" && (
                <div className="mt-4">
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

        {/* שלב 3: פרטים, קישורי Bit/PayBox ואישור */}
        {step === 3 && (
          <form
            onSubmit={handleSubmitOrder}
            className="space-y-5 bg-stone-900 border border-stone-800 rounded-3xl p-5"
          >
            <h3 className="font-black text-lg text-amber-400">🧾 סיכום ההזמנה שלך</h3>

            <div className="bg-stone-950 rounded-2xl p-4 border border-stone-800 space-y-2">
              <div className="text-xs text-stone-300 flex flex-wrap gap-2 items-center">
                <span className="px-2.5 py-1 rounded-md bg-stone-800 text-amber-300 font-bold">
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

            {(settings.bitLink || settings.payboxLink) && (
              <div className="bg-stone-950/80 border border-stone-800 rounded-2xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-stone-300">💳 תשלום מהיר באפליקציה:</div>
                <div className="flex flex-wrap gap-2">
                  {settings.bitLink && (
                    <a
                      href={settings.bitLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center py-2.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs transition"
                    >
                      תשלום ב-Bit 📲
                    </a>
                  )}
                  {settings.payboxLink && (
                    <a
                      href={settings.payboxLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs transition"
                    >
                      תשלום ב-PayBox 💳
                    </a>
                  )}
                </div>
              </div>
            )}

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
                → שנה אופן קבלה
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
              המשך להזמנה ←
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

      {/* חלונית דירוג נפרדת */}
      {ratingModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setRatingModalOpen(false)}
        >
          <div
            className="bg-stone-900 border border-amber-500/50 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-amber-400">⭐ דרג את עגלת הקפה</h3>
              <button
                onClick={() => setRatingModalOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-stone-800 text-stone-300 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {ratingSentSuccess ? (
              <div className="bg-emerald-950/70 border border-emerald-500 text-emerald-200 rounded-2xl p-4 text-center text-sm font-bold">
                🙏 תודה רבה על הדירוג! שמחים שנהנית.
              </div>
            ) : (
              <form onSubmit={handleSendReview} className="space-y-4">
                <p className="text-xs text-stone-400">
                  איך הייתה החוויה, הקפה והשירות שלנו? נשמח לשמוע!
                </p>

                <div className="flex justify-center gap-2 text-3xl">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatingStars(star)}
                      className={`transition transform hover:scale-110 cursor-pointer ${
                        star <= ratingStars ? "text-amber-400" : "text-stone-600"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="כתוב כמה מילים (לא חובה)..."
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                />

                <button
                  type="submit"
                  disabled={ratingSending}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm cursor-pointer"
                >
                  {ratingSending ? "שולח דירוג..." : "שלח דירוג ⭐"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* סרגל צד: ההזמנות שלי (פעילות + עבר) */}
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

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOrdersTab("active")}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
                  ordersTab === "active"
                    ? "bg-amber-500 text-stone-950 border-amber-400"
                    : "bg-stone-950 text-stone-400 border-stone-800"
                }`}
              >
                🔥 פעילות ({activeOrders.length})
              </button>
              <button
                onClick={() => setOrdersTab("past")}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
                  ordersTab === "past"
                    ? "bg-amber-500 text-stone-950 border-amber-400"
                    : "bg-stone-950 text-stone-400 border-stone-800"
                }`}
              >
                📜 הזמנות עבר ({pastOrders.length})
              </button>
            </div>

            {orderSuccess && ordersTab === "active" && (
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

            {displayedOrdersList.length === 0 ? (
              <p className="text-center text-stone-400 text-sm py-10">
                {ordersTab === "active"
                  ? "אין לך הזמנות פעילות כרגע ☕"
                  : "אין הזמנות עבר עדיין 📜"}
              </p>
            ) : (
              displayedOrdersList.map((ord) => {
                const isActive = activeStatuses.includes(ord.status);
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
                        {ord.date} {ord.pickupTime ? `| ${ord.pickupTime}` : ""}
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

                    {isActive && (settings.bitLink || settings.payboxLink) && (
                      <div className="flex gap-2 pt-1">
                        {settings.bitLink && (
                          <a
                            href={settings.bitLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-center py-1.5 rounded-xl bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs font-bold"
                          >
                            שלם ב-Bit
                          </a>
                        )}
                        {settings.payboxLink && (
                          <a
                            href={settings.payboxLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-center py-1.5 rounded-xl bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold"
                          >
                            שלם ב-PayBox
                          </a>
                        )}
                      </div>
                    )}

                    {!isActive && (
                      <button
                        onClick={() => {
                          setCart(ord.items || []);
                          setSidebarOpen(false);
                          setStep(2);
                        }}
                        className="w-full py-2 rounded-xl bg-stone-800 hover:bg-amber-500/20 text-amber-400 border border-stone-700 text-xs font-bold cursor-pointer"
                      >
                        🔄 הזמן שוב פריטים אלו
                      </button>
                    )}

                    {ord.status === "pending" && (
                      <button
                        onClick={() => handleCancelMyOrder(ord.id)}
                        className="w-full py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 text-red-300 text-xs font-bold cursor-pointer"
                      >
                        ביטול הזמנה
                      </button>
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