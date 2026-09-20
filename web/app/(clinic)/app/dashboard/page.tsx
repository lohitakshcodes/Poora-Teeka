import React from 'react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
          Clinic Dashboard
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Course completion funnel, vial efficiency, and reminder delivery metrics.
        </p>
      </div>
    </div>
  );
}
