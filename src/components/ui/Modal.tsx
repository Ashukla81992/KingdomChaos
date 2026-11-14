'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useSettings } from '@/lib/settings';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  /** Hide the close button (forced choices). */
  dismissible?: boolean;
}

export function Modal({ open, onClose, title, children, wide, dismissible = true }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useSettings();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, button, [tabindex]:not([tabindex="-1"])');
      el?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex]:not([tabindex="-1"])')].filter(
          (x) => !x.hasAttribute('disabled'),
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#1d2440]/45 p-2 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && dismissible) onClose();
          }}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
            initial={reducedMotion ? false : { y: 30, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-[#f0e6cf] px-5 py-3">
              <h2 id={titleId} className="text-xl font-semibold">
                {title}
              </h2>
              {dismissible && (
                <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
                  <X size={20} />
                </button>
              )}
            </div>
            <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
