"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { Button } from './ui/Button';
import { Icon } from './icons';

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure component is mounted before accessing localStorage
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load saved preference
  useEffect(() => {
    if (!isMounted) return;

    if (isOpen) {
      const saved = localStorage.getItem('discord_remember_me');
      setRememberMe(saved === 'true');
    }
  }, [isOpen, isMounted]);

  // Handle escape key
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isLoading) {
          onClose();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isLoading, onClose]);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSignIn = async () => {
    if (!isMounted) return;

    setIsLoading(true);

    // Save remember me preference
    localStorage.setItem('discord_remember_me', rememberMe.toString());

    // Clear any existing session login time (will be reset by SessionTimeoutManager)
    localStorage.removeItem('session_login_time');

    // Sign in with Discord
    await signIn('discord', {
      callbackUrl: window.location.href,
    });

    setIsLoading(false);
  };

  // Don't render until mounted (prevents SSR issues)
  if (!isMounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]"
            onClick={!isLoading ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Modal Container - Centered on entire screen */}
          <div
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-y-auto"
            onClick={!isLoading ? onClose : undefined}
          >
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.9, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="
                glass-strong backdrop-blur-md rounded-xl border-2 border-primary/30
                shadow-elevated-3 w-full my-auto
                max-w-md sm:max-w-lg md:max-w-xl
                p-6 sm:p-8 md:p-10
              "
              role="dialog"
              aria-labelledby="modal-title"
              aria-describedby="modal-description"
              aria-modal="true"
            >
              {/* Discord Icon */}
              <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-primary/10">
                  <Icon name="discord" size="xl" className="text-primary w-12 h-12 sm:w-14 sm:h-14" />
                </div>
              </div>

              {/* Title */}
              <h2
                id="modal-title"
                className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4 text-center font-game-decorative"
              >
                Sign in to ELYSIUM
              </h2>

              {/* Description */}
              <p
                id="modal-description"
                className="text-sm sm:text-base text-gray-300 mb-6 sm:mb-8 text-center font-game leading-relaxed px-2"
              >
                Connect with your Discord account to access guild features
              </p>

              {/* Remember Me Checkbox */}
              <div className="mb-6 sm:mb-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => !isLoading && setRememberMe(!rememberMe)}
                  disabled={isLoading}
                  className="flex items-center gap-3 sm:gap-4 cursor-pointer group"
                >
                  <div
                    className={`
                      w-6 h-6 sm:w-7 sm:h-7 border-2 rounded flex-shrink-0
                      transition-all duration-200
                      flex items-center justify-center
                      ${rememberMe
                        ? 'bg-primary border-primary'
                        : 'border-gray-600 group-hover:border-primary/50'
                      }
                    `}
                  >
                    {rememberMe && (
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm sm:text-base text-gray-300 font-game group-hover:text-white transition-colors">
                    Remember me (stay signed in for 7 days)
                  </span>
                </button>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 sm:gap-4">
                <Button
                  variant="primary"
                  onClick={handleSignIn}
                  loading={isLoading}
                  disabled={isLoading}
                  fullWidth
                  size="lg"
                  icon={!isLoading ? <Icon name="discord" size="md" /> : undefined}
                  className="tap-target"
                >
                  Sign in with Discord
                </Button>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={isLoading}
                  fullWidth
                  size="lg"
                  className="tap-target"
                >
                  Cancel
                </Button>
              </div>

              {/* Privacy Note */}
              <p className="text-xs sm:text-sm text-gray-500 mt-6 sm:mt-8 text-center font-game leading-relaxed max-w-prose mx-auto">
                We only access your Discord profile, guild&nbsp;membership, and&nbsp;roles
              </p>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
