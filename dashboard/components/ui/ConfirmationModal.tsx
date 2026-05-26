"use client";

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const variantStyles = {
  danger: {
    icon: '⚠️',
    iconClass: 'text-danger',
    confirmVariant: 'danger' as const,
  },
  warning: {
    icon: '⚡',
    iconClass: 'text-warning',
    confirmVariant: 'primary' as const,
  },
  info: {
    icon: 'ℹ️',
    iconClass: 'text-info',
    confirmVariant: 'primary' as const,
  },
};

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const style = variantStyles[variant];

  // Focus trap
  useEffect(() => {
    if (isOpen) {
      confirmButtonRef.current?.focus();

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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={!isLoading ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="
                glass-strong backdrop-blur-md rounded-lg border-2 border-primary/30
                shadow-elevated-3 max-w-md w-full p-6
              "
              role="alertdialog"
              aria-labelledby="modal-title"
              aria-describedby="modal-description"
              aria-modal="true"
            >
              {/* Icon */}
              <div className={`text-5xl mb-4 text-center ${style.iconClass}`}>
                {style.icon}
              </div>

              {/* Title */}
              <h2
                id="modal-title"
                className="text-fluid-xl font-bold text-white mb-3 text-center font-game-decorative"
              >
                {title}
              </h2>

              {/* Description */}
              <p
                id="modal-description"
                className="text-fluid-sm text-gray-300 mb-6 text-center font-game leading-relaxed"
              >
                {description}
              </p>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={isLoading}
                  fullWidth
                  className="tap-target"
                >
                  {cancelLabel}
                </Button>
                <Button
                  ref={confirmButtonRef}
                  variant={style.confirmVariant}
                  onClick={onConfirm}
                  loading={isLoading}
                  disabled={isLoading}
                  fullWidth
                  className="tap-target"
                >
                  {confirmLabel}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
