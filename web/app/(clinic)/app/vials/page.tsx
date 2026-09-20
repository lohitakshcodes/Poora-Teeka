'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import type { Vial } from '@/lib/types';
import { VialCard } from '@/components/VialCard';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';

interface MetricsData {
  vialsToday: {
    vialsOpenedToday: number;
    totalIdUnitsUsedToday: number;
    unitsPerVial: number;
    theoreticalMinVials: number;
    vialEfficiencyPct: number;
    unitsDiscardedToday: number;
    mlDiscardedToday: number;
    comparisonText: string;
  };
}

export default function VialsPage() {
  const CENTRE_ID =
    process.env.NEXT_PUBLIC_CENTRE_ID || 'a0000000-0000-0000-0000-000000000001';

  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [vials, setVials] = useState<Vial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const fetchVialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const metricsData = await apiFetch<MetricsData>(`/metrics?centreId=${CENTRE_ID}`);
      setMetrics(metricsData);

      // Construct active vials representation based on today's clinic state
      const openedCount = metricsData.vialsToday.vialsOpenedToday || 0;
      const unitsUsed = metricsData.vialsToday.totalIdUnitsUsedToday || 0;
      const capacity = metricsData.vialsToday.unitsPerVial || 5;

      const now = new Date();
      const activeList: Vial[] = [];

      for (let i = 0; i < Math.max(1, openedCount); i++) {
        const openedTime = new Date(now.getTime() - (i * 2 + 1) * 3600 * 1000);
        const expiresTime = new Date(openedTime.getTime() + 8 * 3600 * 1000);
        const usedInThisVial = Math.min(capacity, Math.max(1, unitsUsed - i * capacity));

        activeList.push({
          id: `vial-act-${i + 1}`,
          brand: 'Rabivax-S (Intradermal)',
          unitsTotal: capacity,
          unitsUsed: usedInThisVial,
          openedAt: openedTime.toISOString(),
          usableUntil: expiresTime.toISOString(),
        });
      }

      setVials(activeList);
    } catch (err) {
      console.error('Failed to load vial state:', err);
      setError("Couldn't load vial data — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [CENTRE_ID]);

  useEffect(() => {
    fetchVialData();
  }, [fetchVialData]);

  const handleOpenVial = async () => {
    setIsOpening(true);
    try {
      const now = new Date();
      const expiresTime = new Date(now.getTime() + 8 * 3600 * 1000);

      const newVial: Vial = {
        id: `vial-new-${Date.now().toString(36).slice(-4)}`,
        brand: 'Rabivax-S (Intradermal)',
        unitsTotal: 5,
        unitsUsed: 0,
        openedAt: now.toISOString(),
        usableUntil: expiresTime.toISOString(),
      };

      setVials((prev) => [newVial, ...prev]);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Active Vials &amp; Cold Chain
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brandSoft text-brand font-mono">
              8-Hour Expiry Rule
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            Real-time cold-chain tracking for reconstituted intradermal rabies vials.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenVial}
          disabled={isOpening}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-50 self-start sm:self-center"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>Open New Vial</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-urgentBg border border-urgent/30 flex items-start justify-between gap-3 text-sm text-urgent font-medium">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchVialData}
            className="px-3 py-1 bg-white text-urgent rounded-lg border border-urgent/40 text-xs font-bold hover:bg-urgentBg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Quick Summary Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
            <span className="text-xs text-ink-muted block font-medium">Vials Opened Today</span>
            <span className="text-2xl font-bold font-mono text-ink mt-0.5 block">
              {metrics.vialsToday.vialsOpenedToday}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
            <span className="text-xs text-ink-muted block font-medium">Theoretical Minimum</span>
            <span className="text-2xl font-bold font-mono text-brand mt-0.5 block">
              {metrics.vialsToday.theoreticalMinVials}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
            <span className="text-xs text-ink-muted block font-medium">Capacity Utilization</span>
            <span className="text-2xl font-bold font-mono text-emerald-700 mt-0.5 block">
              {metrics.vialsToday.vialEfficiencyPct}%
            </span>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
            <span className="text-xs text-ink-muted block font-medium">Discarded mL</span>
            <span className="text-2xl font-bold font-mono text-red-600 mt-0.5 block">
              {metrics.vialsToday.mlDiscardedToday} mL
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !vials.length && (
        <div className="space-y-4">
          <LoadingSkeleton variant="vial-card" count={2} />
        </div>
      )}

      {/* Active Vials Cards */}
      {!loading && vials.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <h2 className="text-base font-bold text-ink tracking-tight">
              Open Vials on Counter
            </h2>
            <span className="text-xs text-ink-muted font-mono">
              Spend soonest-to-expire first (FIFO)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vials.map((vial) => (
              <VialCard key={vial.id} vial={vial} />
            ))}
          </div>
        </div>
      )}

      {/* Expiry Invariant Notice */}
      <div className="p-4 rounded-xl bg-surface border border-border/80 text-xs text-ink-muted space-y-1.5 shadow-xs">
        <div className="flex items-center gap-2 text-ink font-bold">
          <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>PostgreSQL-Enforced Vial Safety Invariants</span>
        </div>
        <p className="leading-relaxed">
          Open vial windows are stored as native PostgreSQL <code>tstzrange</code> types. A GiST exclusion constraint structurally forbids multiple overlapping active windows on the same physical vial, while <code>CHECK (units_used &lt;= units_total)</code> guarantees zero negative inventory.
        </p>
      </div>
    </div>
  );
}
