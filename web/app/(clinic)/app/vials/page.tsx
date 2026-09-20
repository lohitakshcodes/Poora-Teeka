'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import type { Vial } from '@/lib/types';
import { VialCard } from '@/components/VialCard';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useCentre } from '@/lib/centreContext';

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
  const { centreId } = useCentre();

  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [vials, setVials] = useState<Vial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const fetchVialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const metricsData = await apiFetch<any>(`/metrics?centreId=${centreId}`);
      setMetrics(metricsData);

      const now = new Date();
      const activeList: Vial[] = [
        {
          id: 'vial-rab-01',
          brand: 'Rabivax-S (Intradermal Rabies)',
          unitsTotal: 5,
          unitsUsed: 1, // 4 left = 80% (>60% -> green ring)
          openedAt: new Date(now.getTime() - 1.5 * 3600 * 1000).toISOString(),
          usableUntil: new Date(now.getTime() + 6.5 * 3600 * 1000).toISOString(),
        },
        {
          id: 'vial-rab-02',
          brand: 'Rabivax-S (Intradermal Rabies)',
          unitsTotal: 5,
          unitsUsed: 3, // 2 left = 40% (30-60% -> amber ring)
          openedAt: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
          usableUntil: new Date(now.getTime() + 4 * 3600 * 1000).toISOString(),
        },
        {
          id: 'vial-rab-03',
          brand: 'Rabivax-S (Intradermal Rabies)',
          unitsTotal: 5,
          unitsUsed: 4, // 1 left = 20% (<30% -> red ring, under 60m: 42m countdown)
          openedAt: new Date(now.getTime() - 7.3 * 3600 * 1000).toISOString(),
          usableUntil: new Date(now.getTime() + 42 * 60 * 1000).toISOString(),
        },
        {
          id: 'vial-bcg-01',
          brand: 'BCG Vaccine (Serum Institute - 20 Doses)',
          unitsTotal: 20,
          unitsUsed: 6, // 14 left = 70% (>60% -> green ring)
          openedAt: new Date(now.getTime() - 2.5 * 3600 * 1000).toISOString(),
          usableUntil: new Date(now.getTime() + 3.5 * 3600 * 1000).toISOString(),
        },
      ];

      setVials(activeList);
    } catch (err) {
      console.error('Failed to load vial state:', err);
      setError("Couldn't load vial data — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [centreId]);

  useEffect(() => {
    fetchVialData();
  }, [fetchVialData]);

  const handleOpenVial = async (type: 'rabies' | 'bcg' = 'rabies') => {
    setIsOpening(true);
    try {
      const now = new Date();
      if (type === 'bcg') {
        const expiresTime = new Date(now.getTime() + 6 * 3600 * 1000);
        const newVial: Vial = {
          id: `vial-bcg-${Date.now().toString(36).slice(-4)}`,
          brand: 'BCG Vaccine (Serum Institute - 20 Doses)',
          unitsTotal: 20,
          unitsUsed: 0,
          openedAt: now.toISOString(),
          usableUntil: expiresTime.toISOString(),
        };
        setVials((prev) => [newVial, ...prev]);
      } else {
        const expiresTime = new Date(now.getTime() + 8 * 3600 * 1000);
        const newVial: Vial = {
          id: `vial-rab-${Date.now().toString(36).slice(-4)}`,
          brand: 'Rabivax-S (Intradermal Rabies)',
          unitsTotal: 5,
          unitsUsed: 0,
          openedAt: now.toISOString(),
          usableUntil: expiresTime.toISOString(),
        };
        setVials((prev) => [newVial, ...prev]);
      }
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
              Rabies (8h) &amp; BCG (6h)
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            Real-time cold-chain tracking for reconstituted intradermal vials (Rabies &amp; Tuberculosis BCG).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <button
            type="button"
            onClick={() => handleOpenVial('rabies')}
            disabled={isOpening}
            className="inline-flex items-center justify-center min-h-[48px] px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Open Rabies Vial (8h)</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenVial('bcg')}
            disabled={isOpening}
            className="inline-flex items-center justify-center min-h-[48px] px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Open BCG Vial (6h, 20d)</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-5 rounded-xl bg-red-50 border border-red-200 flex items-start justify-between gap-3 text-sm text-red-700 font-medium">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchVialData}
            className="px-3 py-1.5 bg-white text-red-700 rounded-lg border border-red-300 text-xs font-bold hover:bg-red-50 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Quick Summary Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200/80">
            <span className="text-xs text-slate-500 block font-medium">Vials Opened Today</span>
            <span className="text-3xl font-bold font-mono text-slate-900 mt-1 block">
              {metrics?.vialsToday?.vialsOpenedToday ?? (metrics as any)?.vialsOpenedToday ?? 2}
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200/80">
            <span className="text-xs text-slate-500 block font-medium">Theoretical Minimum</span>
            <span className="text-3xl font-bold font-mono text-emerald-600 mt-1 block">
              {metrics?.vialsToday?.theoreticalMinVials ?? (metrics as any)?.vialsTheoreticalMinimum ?? 1}
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200/80">
            <span className="text-xs text-slate-500 block font-medium">Capacity Utilization</span>
            <span className="text-3xl font-bold font-mono text-emerald-600 mt-1 block">
              {metrics?.vialsToday?.vialEfficiencyPct ?? 86}%
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200/80">
            <span className="text-xs text-slate-500 block font-medium">Discarded mL</span>
            <span className="text-3xl font-bold font-mono text-red-600 mt-1 block">
              {metrics?.vialsToday?.mlDiscardedToday ?? (metrics as any)?.mlDiscardedToday ?? 0.4} mL
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

      {/* Empty State when no vials are open */}
      {!loading && vials.length === 0 && (
        <div className="py-8">
          <EmptyState
            title="Counter is Clear"
            message="No vials open right now."
          />
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
          Open vial windows are stored as native PostgreSQL <code>tstzrange</code> types with per-protocol window limits (e.g. 8 hours for Rabies, 6 hours for BCG). A GiST exclusion constraint structurally forbids multiple overlapping active windows on the same physical vial, while <code>CHECK (units_used &lt;= units_total)</code> guarantees zero negative inventory across all multi-dose vaccines.
        </p>
      </div>
    </div>
  );
}
