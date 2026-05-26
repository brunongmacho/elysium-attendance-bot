"use client";

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpecialUser } from '@/hooks/useSpecialUser';
import { Icon } from '@/components/icons';

const DEFAULT_THEMES = [
  'crimson', 'wine', 'magenta', 'peach', 'sunset', 'golden', 
  'lime', 'olive', 'emerald', 'forest', 'mint', 'default', 
  'navy', 'arctic', 'cyber', 'purple'
];

export default function ThemeSelector() {
  const { currentTheme, setTheme, themes } = useTheme();
  const { isSpecialUser } = useSpecialUser();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number; isMobile: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Track component mount for SSR compatibility
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate dropdown position when opened - use layout effect to avoid flicker
  useLayoutEffect(() => {
    if (isOpen && buttonRef.current && typeof window !== 'undefined') {
      const rect = buttonRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 640; // sm breakpoint
      const dropdownWidth = isMobile ? window.innerWidth - 32 : 320; // Account for w-[calc(100vw-2rem)] or sm:w-80

      if (isMobile) {
        // On mobile, position with margin to keep within viewport
        setPosition({
          top: rect.bottom + 8,
          right: 0,
          isMobile: true,
        });
      } else {
        // On desktop, ensure dropdown doesn't go off-screen
        const rightEdge = window.innerWidth - rect.right;
        const maxRight = Math.max(16, Math.min(rightEdge, window.innerWidth - dropdownWidth - 16));

        setPosition({
          top: rect.bottom + 8,
          right: maxRight,
          isMobile: false,
        });
      }
    } else if (!isOpen) {
      // Reset position when closed
      setPosition(null);
    }
  }, [isOpen]);

  // Handle Escape key to close dropdown
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      {/* Theme Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 hover:border-primary/50 transition-all duration-200"
        title="Change theme"
        aria-label="Select theme"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span className="text-xl">{themes[currentTheme].icon}</span>
        <span className="hidden sm:inline text-sm text-gray-300 font-game">Theme</span>
        <Icon
          name="chevron-down"
          size="sm"
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Theme Dropdown Portal - Renders outside React hierarchy */}
      {mounted && isOpen && position && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ zIndex: 999999 }}
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu - Responsive positioning */}
          <div
            className="fixed w-[calc(100vw-2rem)] sm:w-80 max-w-md rounded-lg glass-strong shadow-2xl border border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            style={{
              top: `${position.top}px`,
              left: position.isMobile ? '1rem' : 'auto',
              right: position.isMobile ? '1rem' : `${position.right}px`,
              zIndex: 1000000
            }}
            role="menu"
            aria-label="Theme selection menu"
          >
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-white font-game-decorative">Choose Theme</h3>
              <p className="text-xs text-gray-400 mt-1 font-game">Select your guild's color scheme</p>
            </div>

            <div className="p-2 max-h-[60vh] sm:max-h-96 overflow-y-auto">
              {Object.values(themes)
                .filter((theme) => DEFAULT_THEMES.includes(theme.name))
                .map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => {
                    setTheme(theme.name);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg mb-2 transition-all duration-200 ${
                    currentTheme === theme.name
                      ? 'bg-primary/20 border-2 border-primary'
                      : 'bg-gray-800/50 border-2 border-transparent hover:bg-gray-700/50 hover:border-gray-600'
                  }`}
                  role="menuitem"
                  aria-label={`Select ${theme.label} theme`}
                  aria-current={currentTheme === theme.name ? "true" : undefined}
                >
                  <div className="flex items-center gap-3">
                    {/* Theme Icon */}
                    <div className="text-2xl">{theme.icon}</div>

                    {/* Theme Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white font-game">
                          {theme.label}
                        </span>
                        {currentTheme === theme.name && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-white font-game">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 font-game">
                        {theme.description}
                      </p>
                    </div>

                    {/* Color Preview */}
                    <div className="flex gap-1">
                      <div
                        className="w-6 h-6 rounded-full border-2 border-gray-600"
                        style={{ backgroundColor: theme.colors.primary }}
                        title="Primary color"
                      />
                      <div
                        className="w-6 h-6 rounded-full border-2 border-gray-600"
                        style={{ backgroundColor: theme.colors.accent }}
                        title="Accent color"
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-700 bg-gray-900/50">
              <p className="text-xs text-gray-500 text-center font-game">
                Theme saved to your browser
              </p>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
