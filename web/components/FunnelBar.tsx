import React from 'react';
import type { FunnelStep } from '@/lib/types';

interface FunnelBarProps {
  step: FunnelStep;
  maxScheduled?: number;
  className?: string;
}

export function FunnelBar({ step, maxScheduled, className = '' }: FunnelBarProps) {
  const percentage = step.scheduled > 0 ? Math.round((step.given / step.scheduled) * 100) : 0;
  const relativeWidth = maxScheduled && maxScheduled > 0
    ? Math.min(100, Math.round((step.given / maxScheduled) * 100))
    : percentage;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">Dose {step.seq}</span>
          <span className="text-xs text-ink-muted">
            ({step.given} completed of {step.scheduled} scheduled)
          </span>
        </div>
        <span className="font-mono font-bold text-xs text-brand">
          {percentage}% completion
        </span>
      </div>

      {/* Horizontal Bar */}
      <div className="h-3 w-full bg-surfaceSunken rounded-full overflow-hidden border border-border flex">
        <div
          className="h-full bg-brand rounded-full transition-all duration-500 ease-out"
          style={{ width: `${relativeWidth}%` }}
          role="progressbar"
          aria-valuenow={step.given}
          aria-valuemin={0}
          aria-valuemax={step.scheduled}
        />
      </div>
    </div>
  );
}
