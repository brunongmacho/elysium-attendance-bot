"use client";

import { useState, useEffect } from "react";
import { UI } from "@/lib/constants";

export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);

  // Show button when page is scrolled down
  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > UI.BACK_TO_TOP_THRESHOLD) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // Initial check
    toggleVisibility();

    window.addEventListener("scroll", toggleVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", toggleVisibility);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-50 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-primary/20 backdrop-blur-sm border border-primary/50 text-primary hover:bg-primary/30 hover:border-primary hover:scale-110 transition-all duration-300 shadow-lg glow-primary group tap-target"
      aria-label="Back to top"
      title="Back to top"
    >
      <span className="text-2xl font-bold group-hover:-translate-y-1 transition-transform duration-300 inline-block">
        ↑
      </span>
    </button>
  );
}
