'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { TomorrowPlanResponse } from '@/lib/types';
import { SavingsCounter } from '@/components/SavingsCounter';
import { PlanSlotGroup } from '@/components/PlanSlotGroup';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';

export default function PlanPage() {
  const [data, setData] = useState<TomorrowPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const centreId = process.env.NEXT_PUBLIC_CENTRE_ID || 'a0000000-0000-0000-0000-000000000001';
      const res = await apiFetch<TomorrowPlanResponse>(`/plan/tomorrow?centreId=${centreId}`);
      setData(res);
    } catch (err) {
      console.error('Failed to fetch plan:', err);
      setError("Couldn't load tomorrow's plan — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Tomorrow's date for display
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const formattedTomorrow = tomorrowDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const totalPatients = data?.slots.reduce((sum, slot) => sum + slot.patients.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Tomorrow&apos;s Batching Plan
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brandSoft text-brand font-mono">
              Auto-Batched
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            {formattedTomorrow} • Civil Hospital Clinic #1
          </p>
        </div>

        {/* Refresh / Re-run Batching */}
        <button
          type="button"
          onClick={fetchPlan}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-surface text-ink text-xs font-semibold hover:bg-surfaceSunken transition-colors self-start sm:self-center cursor-pointer shadow-xs disabled:opacity-50"
        >
          <svg
            className={`w-3.5 h-3.5 text-brand ${loading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span>{loading ? 'Optimizing...' : 'Refresh Plan'}</span>
        </button>
      </div>

      {/* Inline Error State with Retry */}
      {error && (
        <div className="p-4 rounded-xl bg-urgentBg border border-urgent/30 flex items-start justify-between gap-3 text-sm text-urgent font-medium">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 8.25h.008v.008H12v-.008z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchPlan}
            className="px-3 py-1 bg-white text-urgent rounded-lg border border-urgent/40 text-xs font-bold hover:bg-urgentBg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs animate-pulse space-y-4">
            <div className="h-4 w-40 bg-slate-200 rounded" />
            <div className="h-10 w-72 bg-slate-200 rounded" />
            <div className="h-4 w-96 bg-slate-200 rounded" />
          </div>
          <div className="space-y-3">
            <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
            <LoadingSkeleton variant="plan-slot" count={3} />
          </div>
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-6">
          {/* 1. TOP SAVINGS COUNTER (Section 6 & Motion Budget #2) */}
          <SavingsCounter
            vialsNeeded={data.vialsNeeded}
            vialsNaive={data.vialsNaive}
          />

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
              <span className="text-xs text-ink-muted block font-medium">Scheduled Slots</span>
              <span className="text-xl font-bold font-mono text-ink mt-0.5 block">
                {data.slots.length} windows
              </span>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
              <span className="text-xs text-ink-muted block font-medium">Batched Patients</span>
              <span className="text-xl font-bold font-mono text-ink mt-0.5 block">
                {totalPatients} patients
              </span>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border shadow-xs col-span-2 sm:col-span-1">
              <span className="text-xs text-ink-muted block font-medium">Max Cold-Chain Window</span>
              <span className="text-xl font-bold font-mono text-brand mt-0.5 block">
                8 Hours
              </span>
            </div>
          </div>

          {/* 2. BATCHING SLOTS TIMELINE (Section 6) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-bold text-ink tracking-tight">
                  Grouped Time Slots
                </h2>
              </div>
              <span className="text-xs text-ink-muted">
                Each slot maps to 1 opened vial
              </span>
            </div>

            {data.slots.length === 0 ? (
              <EmptyState
                title="No Slots Scheduled"
                message="No appointment slots scheduled for tomorrow yet."
              />
            ) : (
              <div className="space-y-3.5">
                {data.slots.map((slot, index) => (
                  <PlanSlotGroup
                    key={slot.slotStart}
                    slot={slot}
                    slotIndex={index}
                    vialLabel={`Batch Vial #${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Clinical Rationale Note */}
          <div className="p-4 rounded-xl bg-surface border border-border/80 text-xs text-ink-muted space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2 text-ink font-bold">
              <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <span>How Poora Teeka Prevents Vaccine Waste</span>
            </div>
            <p className="leading-relaxed">
              Anti-rabies vaccines reconstituted for intradermal (ID) administration expire within <strong>8 hours</strong> once unsealed. Under unbatched walk-in scheduling (naive model: <strong>{data.vialsNaive} vials</strong>), a new vial is frequently unsealed for solitary patients. Poora Teeka clusters returning patients into synchronized arrival windows, reducing tomorrow&apos;s requirement to <strong>{data.vialsNeeded} vials</strong> with zero compromise to clinical care.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
