import React from 'react';
import type { DoseStatus, ReminderStatus } from '@/lib/types';

export type BadgeStatus = DoseStatus | ReminderStatus | string;

interface StatusBadgeProps {
  status: BadgeStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const normalized = status.toUpperCase();

  let colorClasses = 'bg-slate-100 text-statusScheduled border-slate-200';
  let dotColor = 'bg-statusScheduled';

  switch (normalized) {
    case 'SCHEDULED':
    case 'PENDING':
      colorClasses = 'bg-slate-100 text-statusScheduled border-statusScheduled/20';
      dotColor = 'bg-statusScheduled';
      break;
    case 'DUE':
      colorClasses = 'bg-blue-50 text-statusDue border-statusDue/25';
      dotColor = 'bg-statusDue';
      break;
    case 'GIVEN':
    case 'SENT':
      colorClasses = 'bg-emerald-50 text-statusGiven border-statusGiven/25';
      dotColor = 'bg-statusGiven';
      break;
    case 'MISSED':
    case 'FAILED':
      // Urgent red: earned by real stakes for MISSED doses
      colorClasses = 'bg-urgentBg text-urgent border-urgent/25 font-bold';
      dotColor = 'bg-urgent';
      break;
    case 'RECOVERED':
      colorClasses = 'bg-amber-50 text-statusRecovered border-statusRecovered/25';
      dotColor = 'bg-statusRecovered';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase border ${colorClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
      {normalized}
    </span>
  );
}
