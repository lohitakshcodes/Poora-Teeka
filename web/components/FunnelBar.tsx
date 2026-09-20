import React from 'react';
import type { FunnelStep } from '@/lib/types';

interface FunnelBarProps {
  step: FunnelStep;
  maxScheduled?: number;
  className?: string;
}

export function FunnelBar({ step, className = '' }: FunnelBarProps) {
  const percentage = step.scheduled > 0
    ? Math.round((step.given / step.scheduled) * 100)
    : 0;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Label: "Dose 1", "Dose 2" etc on the left */}
      <span className="w-20 font-semibold text-slate-800 text-sm shrink-0">
        Dose {step.seq}
      </span>

      {/* Bar: bg-emerald-500 width proportional to completion %, bg-slate-200 for remainder, height: h-6, rounded-full */}
      <div className="flex-1 h-6 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-6 bg-emerald-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Percentage text on the right */}
      <span className="w-14 text-right font-mono font-bold text-sm text-slate-800 shrink-0">
        {percentage}%
      </span>
    </div>
  );
}
