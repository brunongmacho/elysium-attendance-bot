"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

interface MarkAsKilledModalProps {
  bossName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (killedBy: string, killTime?: string, spawnTime?: string) => void;
  defaultKilledBy?: string;
}

export default function MarkAsKilledModal({
  bossName,
  isOpen,
  onClose,
  onConfirm,
  defaultKilledBy = "",
}: MarkAsKilledModalProps) {
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [killTime, setKillTime] = useState("");
  const [spawnTime, setSpawnTime] = useState("");
  const [setMode, setSetMode] = useState<"kill" | "spawn">("kill");
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLButtonElement>(null);

  // Handle mounting for SSR compatibility
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Focus first interactive element when modal opens
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 0);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  // Initialize with current time when modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      // Format for datetime-local input: YYYY-MM-DDThh:mm
      const formattedTime = format(now, "yyyy-MM-dd'T'HH:mm");
      setKillTime(formattedTime);
      setSpawnTime(formattedTime);
      setUseCurrentTime(true);
      setSetMode("kill");
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (setMode === "kill") {
      // Set kill time mode - spawn time will be calculated
      // Convert from GMT+8 to UTC since input is in GMT+8
      const timeToSend = useCurrentTime
        ? undefined
        : fromZonedTime(killTime, DEFAULT_TIMEZONE).toISOString();
      onConfirm(defaultKilledBy, timeToSend, undefined);
    } else {
      // Set spawn time mode - directly set when boss will spawn
      // Convert from GMT+8 to UTC since input is in GMT+8
      const spawnTimeISO = fromZonedTime(spawnTime, DEFAULT_TIMEZONE).toISOString();
      onConfirm(defaultKilledBy, undefined, spawnTimeISO);
    }
    onClose();
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-4 sm:p-6 relative z-[10000] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" className="text-xl sm:text-2xl font-bold text-white mb-4">
          Mark {bossName} as Killed
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Display who is marking it as killed */}
          <div className="mb-4 p-3 bg-gray-700/50 rounded-md">
            <div className="text-gray-400 text-sm">Killed by:</div>
            <div className="text-white font-semibold">{defaultKilledBy || "Unknown"}</div>
          </div>

          {/* Mode Selection */}
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-semibold mb-2">
              What do you want to set?
            </label>
            <div className="flex gap-2">
              <button
                ref={firstInputRef}
                type="button"
                onClick={() => setSetMode("kill")}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                  setMode === "kill"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
                aria-label="Set kill time mode"
              >
                Kill Time
              </button>
              <button
                type="button"
                onClick={() => setSetMode("spawn")}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                  setMode === "spawn"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
                aria-label="Set spawn time mode"
              >
                Spawn Time
              </button>
            </div>
          </div>

          {/* Kill Time Mode */}
          {setMode === "kill" && (
            <>
              {/* Use Current Time Checkbox */}
              <div className="mb-4">
                <label className="flex items-center text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCurrentTime}
                    onChange={(e) => setUseCurrentTime(e.target.checked)}
                    className="mr-2 w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm">Use current time (now)</span>
                </label>
              </div>

              {/* Kill Time Input */}
              {!useCurrentTime && (
                <div className="mb-4">
                  <label className="block text-gray-300 text-sm font-semibold mb-2">
                    When was it killed?
                  </label>
                  <input
                    type="datetime-local"
                    value={killTime}
                    onChange={(e) => setKillTime(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required={!useCurrentTime}
                    aria-label="Select kill time"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Spawn time will be calculated automatically
                  </p>
                </div>
              )}
            </>
          )}

          {/* Spawn Time Mode */}
          {setMode === "spawn" && (
            <div className="mb-4">
              <label className="block text-gray-300 text-sm font-semibold mb-2">
                When will it spawn?
              </label>
              <input
                type="datetime-local"
                value={spawnTime}
                onChange={(e) => setSpawnTime(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                aria-label="Select spawn time"
              />
              <p className="text-xs text-gray-400 mt-1">
                Set exact spawn time directly
              </p>
            </div>
          )}

          {/* Buttons - Consistent touch targets */}
          <div className="flex gap-2 sm:gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 sm:py-3 bg-gray-600 hover:bg-gray-700 active:scale-95 text-white rounded-md transition-all duration-200 text-sm sm:text-base"
              aria-label="Cancel and close modal"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 sm:py-3 bg-red-600 hover:bg-red-700 active:scale-95 disabled:opacity-50 text-white font-semibold rounded-md transition-all duration-200 text-sm sm:text-base"
              aria-label={`Confirm marking ${bossName} as killed`}
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
