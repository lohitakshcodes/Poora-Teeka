'use client';

import React, { useEffect, useState } from 'react';

interface CountdownTimerProps {
  usableUntil: string | Date;
  className?: string;
  showLabel?: boolean;
}

export function CountdownTimer({
  usableUntil,
  className = '',
  showLabel = true,
}: CountdownTimerProps) {
  const targetMs = new Date(usableUntil).getTime();
  const [remainingMs, setRemainingMs] = useState<number>(() => targetMs - Date.now());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setRemainingMs(targetMs - Date.now());

    const interval = setInterval(() => {
      setRemainingMs(targetMs - Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [targetMs]);

  const isExpired = remainingMs <= 0;
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  // Under 60 minutes: text-red-600 font-bold
  const isUnder60 = !isExpired && totalSeconds < 3600;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const timeString = isExpired
    ? '00:00:00'
    : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className={`flex flex-col items-center ${className}`} suppressHydrationWarning>
      <span
        className={`font-mono text-2xl tracking-wide tabular-nums ${
          isUnder60
            ? 'text-red-600 font-bold animate-pulse'
            : isExpired
            ? 'text-red-600 font-bold'
            : 'text-slate-800 font-semibold'
        }`}
      >
        {timeString}
      </span>
      {showLabel && (
        <span className="text-xs text-slate-500 mt-1">
          {isExpired ? 'Cold chain expired' : isUnder60 ? 'Expires in under 1 hour' : 'Cold chain window remaining'}
        </span>
      )}
    </div>
  );
}
