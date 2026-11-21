"use client";

import React, { useState, useEffect } from "react";
import Lobby from "../components/Lobby";

export default function HomePage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
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
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    try {
      const res = await fetch("/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim(), code: generated }),
      });
      if (!res.ok) throw new Error("שגיאה בשליחת הקוד");
      setSentCode(generated);
    } catch {
      setError("לא הצלחנו לשלוח קוד למייל. בדוק שהגדרות המייל מוגדרות.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput.trim() === sentCode) {
      const cleanEmail = emailInput.trim().toLowerCase();
      localStorage.setItem("coffee_user_email", cleanEmail);
      setUserEmail(cleanEmail);
    } else {
      setError("קוד שגוי, נסה שוב.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("coffee_user_email");
    setUserEmail(null);
    setSentCode(null);
    setCodeInput("");
  };

  if (userEmail) {
    return <Lobby userEmail={userEmail} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-stone-950 text-white" dir="rtl">
      <div className="max-w-sm w-full bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-5 shadow-2xl">
        <div className="text-center space-y-1">
          <div className="text-4xl">☕</div>
          <h1 className="text-2xl font-black text-amber-400">עגלת הקפה</h1>
          <p className="text-xs text-stone-400">התחברות מהירה להזמנת קפה ומאפים</p>
        </div>

        {error && (
          <div className="bg-red-950/70 border border-red-700 text-red-200 text-xs p-3 rounded-xl text-center">
            {error}
          </div>
        )}

        {!sentCode ? (
          <form onSubmit={handleSendCode} className="space-y-3">
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="הכנס כתובת אימייל..."
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm transition cursor-pointer"
            >
              {loading ? "שולח קוד..." : "שלח קוד אימות למייל"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <p className="text-xs text-stone-300 text-center">
              שלחנו קוד בן 6 ספרות אל <strong className="text-amber-400">{emailInput}</strong>
            </p>
            <input
              type="text"
              required
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="הזן קוד אימות..."
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 text-center tracking-widest font-mono text-lg text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm transition cursor-pointer"
            >
              כניסה לתפריט ←
            </button>
          </form>
        )}
      </div>
    </div>
  );
}