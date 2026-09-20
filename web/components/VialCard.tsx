'use client';

import React from 'react';
import type { Vial } from '@/lib/types';
import { CountdownTimer } from './CountdownTimer';

interface VialCardProps {
  vial: Vial;
  className?: string;
}

export function VialCard({ vial, className = '' }: VialCardProps) {
  const unitsTotal = Math.max(1, vial.unitsTotal);
  const unitsUsed = Math.min(unitsTotal, Math.max(0, vial.unitsUsed));
  const unitsRemaining = Math.max(0, unitsTotal - unitsUsed);
  const remainingPct = (unitsRemaining / unitsTotal) * 100;

  // Ring color: green if >60% remaining, amber if 30-60%, red if <30% remaining
  let ringColor = 'text-emerald-500';
  if (remainingPct < 30) {
    ringColor = 'text-red-500';
  } else if (remainingPct <= 60) {
    ringColor = 'text-amber-500';
  }

  // Circular progress ring using SVG circle (r=40, circumference=251)
  // fills based on units_used / units_total
  const circumference = 251;
  const usedRatio = unitsUsed / unitsTotal;
  const strokeDashoffset = Math.round(circumference * (1 - usedRatio));

  const openedTimeStr = new Date(vial.openedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`bg-white rounded-xl shadow-sm p-5 border border-slate-200/80 flex flex-col items-center text-center ${className}`}
    >
      {/* Top Header: Vial brand name in text-lg font-semibold, "X of Y units used" in text-sm text-slate-500 */}
      <div className="w-full text-left mb-3">
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          {vial.brand}
        </h3>
        <p className="text-sm text-slate-500 mt-0.5">
          {vial.unitsUsed} of {vial.unitsTotal} units used
        </p>
      </div>

      {/* Circular Progress Ring using SVG circle (r=40, circumference=251) */}
      <div className="relative flex items-center justify-center my-3">
        <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
          {/* Background Ring */}
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="currentColor"
            strokeWidth="8"
            className="text-slate-100"
            fill="transparent"
          />
          {/* Progress Ring filling based on units_used / units_total */}
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray="251"
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${ringColor} transition-all duration-500 ease-out`}
            fill="transparent"
          />
        </svg>

        {/* Center Text inside Ring */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold font-mono text-slate-800 leading-none">
            {unitsRemaining}
          </span>
          <span className="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-wider">
            left
          </span>
        </div>
      </div>

      {/* Large countdown timer below the ring: HH:MM:SS ticking live every second in font-mono text-2xl */}
      <div className="my-2">
        <CountdownTimer usableUntil={vial.usableUntil} />
      </div>

      {/* Meta Footer */}
      <div className="w-full pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-mono">
        <span>Vial {vial.id}</span>
        <span>Opened {openedTimeStr}</span>
      </div>
    </div>
  );
}
