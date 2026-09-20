import React from 'react';
import { EmptyState } from '@/components/EmptyState';

export default function VialsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
          Active Vials
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Open vial management and real-time cold-chain expiry countdowns.
        </p>
      </div>

      <div className="pt-8">
        <EmptyState
          message="No vials open right now. They'll appear here once one's started."
        />
      </div>
    </div>
  );
}
