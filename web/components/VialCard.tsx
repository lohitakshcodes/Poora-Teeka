import React from 'react';
import type { Vial } from '@/lib/types';
import { CountdownTimer } from './CountdownTimer';

interface VialCardProps {
  vial: Vial;
  className?: string;
}

export function VialCard({ vial, className = '' }: VialCardProps) {
  const unitsRemaining = Math.max(0, vial.unitsTotal - vial.unitsUsed);
  const openedTimeStr = new Date(vial.openedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4 ${className}`}>
      {/* Header: Brand and Countdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand" aria-hidden="true" />
            <h3 className="text-lg font-bold text-ink tracking-tight">{vial.brand}</h3>
          </div>
          <p className="text-xs text-ink-muted mt-0.5 font-mono">
            Vial ID: {vial.id} • Opened at {openedTimeStr}
          </p>
        </div>

        <CountdownTimer usableUntil={vial.usableUntil} showLabel />
      </div>

      {/* Capacity & Unit Pips */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-ink">
            {vial.unitsUsed} of {vial.unitsTotal} doses drawn
          </span>
          <span className="font-mono text-ink-muted">
            {unitsRemaining} {unitsRemaining === 1 ? 'dose' : 'doses'} remaining
          </span>
        </div>

        {/* Visual Unit Pips */}
        <div className="flex items-center gap-1.5 flex-wrap" role="img" aria-label={`${vial.unitsUsed} of ${vial.unitsTotal} units used`}>
          {Array.from({ length: vial.unitsTotal }).map((_, i) => {
            const isUsed = i < vial.unitsUsed;
            return (
              <div
                key={i}
                className={`h-4 flex-1 min-w-[14px] max-w-[28px] rounded-sm transition-colors border ${
                  isUsed
                    ? 'bg-slate-200 border-slate-300'
                    : 'bg-brand text-white border-brand'
                }`}
                title={`Unit ${i + 1}: ${isUsed ? 'Drawn/Used' : 'Available'}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
