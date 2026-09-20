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
  showLabel = false,
}: CountdownTimerProps) {
  const targetMs = new Date(usableUntil).getTime();
  const [remainingMs, setRemainingMs] = useState<number>(() => targetMs - Date.now());

  useEffect(() => {
    // Initial sync
    setRemainingMs(targetMs - Date.now());

    const interval = setInterval(() => {
      const diff = targetMs - Date.now();
      setRemainingMs(diff);
      if (diff <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetMs]);

  const isExpired = remainingMs <= 0;
  // Under 60 minutes: urgent red visual state (Motion Budget #1)
  const isUrgent = !isExpired && remainingMs < 60 * 60 * 1000;

  let timeString = '';
  if (isExpired) {
    timeString = 'EXPIRED';
  } else {
    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      timeString = `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    } else {
      timeString = `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    }
  }

  const badgeStyle = isExpired
    ? 'bg-urgentBg text-urgent border-urgent/40 font-bold'
    : isUrgent
    ? 'bg-urgentBg text-urgent border-urgent/40 font-semibold animate-pulse'
    : 'bg-surfaceSunken text-ink-muted border-border font-medium';

  return (
    <div className={`inline-flex items-center gap-1.5 font-mono text-sm px-2.5 py-1 rounded border ${badgeStyle} ${className}`}>
      {showLabel && (
        <span className="text-xs uppercase font-sans tracking-wide text-ink-muted mr-1">
          {isExpired ? 'Status:' : 'Expires in:'}
        </span>
      )}
      <svg
        className={`w-3.5 h-3.5 ${isUrgent || isExpired ? 'text-urgent' : 'text-ink-muted'}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="2"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{timeString}</span>
    </div>
  );
}
