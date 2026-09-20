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
  const mlSaved = (vialsSaved * 1).toFixed(1).replace(/\.0$/, '');

  return (
    <div
      className={`bg-white rounded-2xl p-6 sm:p-8 border border-emerald-200/80 shadow-md bg-gradient-to-br from-white via-emerald-50/40 to-emerald-50/70 relative overflow-hidden ${className}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand)] font-mono bg-emerald-100/80 px-2.5 py-1 rounded-full inline-block">
            Batching Optimization Savings
          </span>

          {/* Dominant Hero numbers */}
          <div className="flex items-baseline gap-4 flex-wrap pt-1">
            <div className="flex items-baseline gap-3">
              <span
                style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif' }}
                className="text-7xl font-normal text-[var(--brand)] tracking-tight leading-none"
              >
                <MetricNumber
                  value={vialsNeeded}
                  durationMs={600}
                  className="text-7xl font-normal text-[var(--brand)] leading-none"
                  style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif' }}
                />
              </span>
              <span className="text-2xl font-semibold text-slate-800 tracking-tight">
                vials needed
              </span>
            </div>

            <div className="text-2xl text-[var(--ink-muted)] font-normal flex items-baseline gap-1.5">
              <span>instead of</span>
              <span className="line-through decoration-2 font-semibold text-slate-500">
                {vialsNaive}
              </span>
            </div>
          </div>

          {/* ml saved shown in a smaller line below */}
          <div className="pt-1 flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>
              {mlSaved} mL vaccine saved from open-vial discard ({percentageSaved}% waste reduction)
            </span>
          </div>
        </div>

        {/* Highlight Card */}
        <div className="bg-white/90 backdrop-blur-xs rounded-xl p-5 border border-emerald-200 shadow-xs shrink-0 text-center lg:text-right">
          <span className="text-3xl sm:text-4xl font-black text-[var(--brand)] block font-mono">
            +{vialsSaved} Vials Saved
          </span>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full inline-block mt-2 font-mono">
            {percentageSaved}% reduction vs. naive scheduling
          </span>
        </div>
      </div>
    </div>
  );
}
