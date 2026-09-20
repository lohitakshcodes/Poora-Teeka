'use client';

import React, { useEffect, useState } from 'react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'urgent' | 'info';
  durationMs?: number;
  onClose: () => void;
}

export function Toast({
  message,
  type = 'success',
  durationMs = 3500,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Slide up immediately on mount (Motion Budget #4)
    requestAnimationFrame(() => setIsVisible(true));

    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Allow fade-out animation to finish
    }, durationMs);

    return () => clearTimeout(hideTimer);
  }, [durationMs, onClose]);

  const styleClasses =
    type === 'urgent'
      ? 'bg-urgent text-white border-urgent shadow-lg'
      : type === 'info'
      ? 'bg-ink text-white border-ink shadow-md'
      : 'bg-brand text-white border-brand shadow-md';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-50 max-w-sm flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-300 ease-out transform ${
        isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95'
      } ${styleClasses}`}
    >
      {type === 'urgent' ? (
        <svg className="w-5 h-5 shrink-0 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 8.25h.008v.008H12v-.008z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 shrink-0 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}

      <span className="flex-1 text-xs sm:text-sm">{message}</span>

      <button
        type="button"
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="p-1 rounded hover:bg-white/20 transition-colors cursor-pointer"
        aria-label="Dismiss message"
      >
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
