import React from 'react';
import { MetricNumber } from './MetricNumber';

interface SavingsCounterProps {
  vialsNeeded: number;
  vialsNaive: number;
  className?: string;
}

export function SavingsCounter({
  vialsNeeded,
  vialsNaive,
  className = '',
}: SavingsCounterProps) {
  const vialsSaved = Math.max(0, vialsNaive - vialsNeeded);
  const percentageSaved = vialsNaive > 0 ? Math.round((vialsSaved / vialsNaive) * 100) : 0;

  return (
    <div className={`bg-brandSoft/60 border border-brand/20 rounded-2xl p-6 md:p-8 shadow-sm ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-brand font-mono">
            Optimized Vial Batching Plan
          </p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-4xl md:text-5xl font-black text-brand tracking-tight">
              <MetricNumber value={vialsNeeded} durationMs={600} /> vials needed
            </span>
            <span className="text-xl md:text-2xl text-ink-muted line-through decoration-ink-muted/50 font-medium">
              instead of {vialsNaive}
            </span>
          </div>
          <p className="text-sm text-ink-muted pt-1">
            Intelligent slot batching eliminates open-vial discards across tomorrow&apos;s scheduled sessions.
          </p>
        </div>

        {/* Highlight Badge */}
        <div className="bg-surface rounded-xl p-4 border border-brand/30 shadow-xs shrink-0 text-center sm:text-right">
          <span className="text-2xl md:text-3xl font-bold text-brand block font-mono">
            +{vialsSaved} Vials Saved
          </span>
          <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mt-1">
            {percentageSaved}% vaccine waste reduction
          </span>
        </div>
      </div>
    </div>
  );
}
