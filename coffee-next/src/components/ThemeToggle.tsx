"use client";

import React, { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("coffee_theme");
    if (saved === "light") {
      document.documentElement.classList.add("light");
      setIsLight(true);
    }
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains("light")) {
      html.classList.remove("light");
      localStorage.setItem("coffee_theme", "dark");
      setIsLight(false);
    } else {
      html.classList.add("light");
      localStorage.setItem("coffee_theme", "light");
      setIsLight(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title="החלף מצב תצוגה"
      className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs sm:text-sm font-bold transition cursor-pointer"
    >
      {isLight ? "🌙 כהה" : "☀️ בהיר"}
    </button>
  );
}