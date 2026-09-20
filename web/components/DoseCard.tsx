'use client';

import React, { useState } from 'react';
import type { Dose } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

interface DoseCardProps {
  dose: Dose;
  onMarkGiven?: (doseId: string) => Promise<void> | void;
  className?: string;
}

export function DoseCard({ dose, onMarkGiven, className = '' }: DoseCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const formattedTime = dose.slotStart
    ? new Date(dose.slotStart).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  const handleMarkGiven = async () => {
    if (!onMarkGiven || isSubmitting || isExiting) return;
    setIsSubmitting(true);

    // Motion Budget #3: brief checkmark & smooth exit slide/fade ~300ms
    setIsExiting(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      await onMarkGiven(dose.id);
    } catch (err) {
      setIsExiting(false);
      setIsSubmitting(false);
      throw err;
    }
  };

  return (
    <div
      className={`bg-surface border border-border rounded-xl p-4 md:p-5 shadow-sm transition-all duration-300 ${
        isExiting
          ? 'opacity-0 -translate-x-6 scale-95 pointer-events-none'
          : 'opacity-100 translate-x-0 scale-100'
      } ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Patient and Dose Details */}
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg md:text-xl font-bold text-ink tracking-tight">
              {dose.patient.name}
            </h3>
            <StatusBadge status={isExiting ? 'GIVEN' : dose.status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span className="font-semibold text-brand">
              Dose {dose.seq} of {dose.totalDoses}
            </span>
            <span className="text-border" aria-hidden="true">•</span>
            <span>Phone: {dose.patient.phoneE164}</span>
            <span className="text-border" aria-hidden="true">•</span>
            <span>
              {formattedTime ? (
                <span className="font-medium text-ink">Slot: {formattedTime}</span>
              ) : (
                <span className="italic text-ink-muted">Walk-in (no slot)</span>
              )}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {dose.status !== 'GIVEN' && onMarkGiven && (
            <button
              type="button"
              onClick={handleMarkGiven}
              disabled={isSubmitting || isExiting}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${
                isExiting
                  ? 'bg-statusGiven text-white'
                  : 'bg-brand hover:bg-emerald-800 text-white cursor-pointer active:scale-[0.98]'
              }`}
            >
              {isExiting ? (
                <>
                  <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>Recorded</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>Mark Given</span>
                </>
              )}
            </button>
          )}

          {dose.status === 'GIVEN' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-statusGiven bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Completed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
