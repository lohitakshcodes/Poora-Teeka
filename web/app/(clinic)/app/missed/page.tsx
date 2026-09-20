import React from 'react';
import { EmptyState } from '@/components/EmptyState';

export default function MissedPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
          Missed Dose Recovery
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Patient re-engagement queue and automated WhatsApp/voice reminders.
        </p>
      </div>

      <div className="pt-8">
        <EmptyState
          message="Nothing missed. Everyone's on track."
        />
      </div>
    </div>
  );
}
