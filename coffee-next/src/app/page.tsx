"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import Lobby from "../components/Lobby";

export default function HomePage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("coffee_user_email");
    if (saved) setUserEmail(saved);
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const cleanEmail = emailInput.trim().toLowerCase();

    try {
      const res = await fetch("/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "שגיאה בשליחת הקוד");
      }

      sessionStorage.setItem("pending_login_email", cleanEmail);
      setStep("code");
    } catch (err: any) {
      setError(err.message || "לא הצלחנו לשלוח קוד למייל. נסה שוב.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const cleanEmail = (emailInput || sessionStorage.getItem("pending_login_email") || "")
      .trim()
      .toLowerCase();
    const entered = codeInput.trim();

    try {
      let isValid = false;

      // בדיקה מול barber_otps (האוסף שבו route.ts שומר את otpCode) וגם coffee_otps ליתר ביטחון
      for (const collectionName of ["barber_otps", "coffee_otps"]) {
        const snap = await getDoc(doc(db, collectionName, cleanEmail));
        if (snap.exists()) {
          const data = snap.data();
          const savedCode = String(data.otpCode || data.code || "").trim();
          const isNotExpired = !data.otpExpiry || Date.now() < data.otpExpiry;
          if (savedCode === entered && isNotExpired) {
            isValid = true;
            break;
          }
        }
      }

      if (isValid) {
        localStorage.setItem("coffee_user_email", cleanEmail);
        setUserEmail(cleanEmail);
      } else {
        setError("קוד שגוי או שפג תוקפו, נסה שוב.");
      }
    } catch {
      setError("שגיאה באימות הקוד מול השרת, נסה שוב.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("coffee_user_email");
    setUserEmail(null);
    setStep("email");
    setCodeInput("");
  };

  if (userEmail) {
    return <Lobby userEmail={userEmail} onLogout={handleLogout} />;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100"
      dir="rtl"
    >
      <div className="max-w-sm w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-7 space-y-6 shadow-2xl">
        <div className="text-center space-y-1.5">
          <div className="text-5xl mb-2">☕</div>
          <h1 className="text-2xl font-black text-amber-400">עגלת הקפה</h1>
          <p className="text-xs text-zinc-400">התחברות מהירה להזמנת קפה ומאפים</p>
        </div>

        {error && (
          <div className="bg-red-950/80 border border-red-700 text-red-200 text-xs p-3 rounded-xl text-center font-bold">
            {error}
          </div>
        )}

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">כתובת אימייל</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-sm transition cursor-pointer shadow-lg"
            >
              {loading ? "שולח קוד..." : "שלח קוד אימות למייל"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-xs text-zinc-300 text-center">
              שלחנו קוד בן 6 ספרות אל <strong className="text-amber-400">{emailInput}</strong>
            </p>
            <input
              type="text"
              inputMode="numeric"
              required
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="הזן קוד 6 ספרות"
              dir="ltr"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-center tracking-widest font-mono text-xl text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm transition cursor-pointer shadow-lg"
            >
              {loading ? "מאמת..." : "כניסה לתפריט ←"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError("");
              }}
              className="w-full text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              החלף כתובת מייל
            </button>
          </form>
        )}
      </div>
    </div>
  );
}