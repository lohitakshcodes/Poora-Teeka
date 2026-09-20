'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { SavingsCounter } from '@/components/SavingsCounter';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';

interface PatientItem {
  doseId: string;
  courseId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  guardianPhone: string | null;
  isMinor: boolean;
  doseSeq: number;
  units: number;
  currentSlotStart: string | null;
}

interface GroupItem {
  groupNumber: number;
  slotIndex: number;
  startTime: string;
  endTime: string;
  slotStartIso: string;
  vialVirtualId: string;
  vialCapacityUnits: number;
  plannedUnits: number;
  walkInReservedUnits: number;
  walkInReservedSlots: number;
  totalAllocatedUnits: number;
  patients: PatientItem[];
}

interface BackendPlanResponse {
  centre: {
    id: string;
    name: string;
    city: string;
    dayStart: string;
    dayEnd: string;
    totalSlotsAvailable: number;
  };
  date: string;
  summary: {
    totalScheduledPatients: number;
    minorsCount: number;
    vialsNeeded: number;
    vialsNeededNaive: number;
    vialsSaved: number;
    savingsPercentage: number;
    vialCapacityUnits: number;
    unitsPerVisit: number;
    walkInReservePercentage: number;
    walkInReservedUnitsPerGroup: number;
    maxPlannedPatientsPerGroup: number;
    comparisonText: string;
  };
  confirmed: boolean;
  confirmedDosesCount: number;
  groupsCount: number;
  groups: GroupItem[];
}

export default function PlanPage() {
  const CENTRE_ID =
    process.env.NEXT_PUBLIC_CENTRE_ID || 'a0000000-0000-0000-0000-000000000001';

  const [data, setData] = useState<BackendPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmToast, setConfirmToast] = useState<string | null>(null);

  const fetchPlan = useCallback(async (isConfirm = false) => {
    if (isConfirm) {
      setConfirming(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const url = `/plan/tomorrow?centreId=${CENTRE_ID}${isConfirm ? '&confirm=true' : ''}`;
      const res = await apiFetch<BackendPlanResponse>(url);
      setData(res);

      if (isConfirm && res.confirmed) {
        setConfirmToast(`Confirmed and wrote slot times onto ${res.confirmedDosesCount} patient doses!`);
        setTimeout(() => setConfirmToast(null), 6000);
      }
    } catch (err) {
      console.error('Failed to fetch plan:', err);
      setError("Couldn't load tomorrow's plan — check connection and try again.");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }, [CENTRE_ID]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const formattedTomorrow = tomorrowDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const summary = data?.summary;
  const groups = data?.groups || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Tomorrow&apos;s Batching Plan
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brandSoft text-brand font-mono">
              Auto-Batched (20% Walk-in Buffer)
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            {formattedTomorrow} • {data?.centre.name || 'Civil Hospital Anti-Rabies Clinic'}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={() => fetchPlan(false)}
            disabled={loading || confirming}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface text-ink text-xs font-semibold hover:bg-surfaceSunken transition-colors cursor-pointer shadow-xs disabled:opacity-50"
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
            <span>{loading ? 'Optimizing...' : 'Re-calculate'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchPlan(true)}
            disabled={loading || confirming || groups.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            {confirming ? (
              <span>Writing Slots...</span>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>Confirm &amp; Schedule Slots</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Toast */}
      {confirmToast && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-semibold flex items-center justify-between shadow-xs">
          <span>{confirmToast}</span>
          <button
            type="button"
            onClick={() => setConfirmToast(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-urgentBg border border-urgent/30 flex items-start justify-between gap-3 text-sm text-urgent font-medium">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchPlan(false)}
            className="px-3 py-1 bg-white text-urgent rounded-lg border border-urgent/40 text-xs font-bold hover:bg-urgentBg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs animate-pulse space-y-4">
            <div className="h-4 w-40 bg-slate-200 rounded" />
            <div className="h-10 w-72 bg-slate-200 rounded" />
          </div>
          <LoadingSkeleton variant="plan-slot" count={3} />
        </div>
      )}

      {/* Content */}
      {data && summary && (
        <div className="space-y-6">
          {/* Top Savings Counter */}
          <SavingsCounter
            vialsNeeded={summary.vialsNeeded}
            vialsNaive={summary.vialsNeededNaive}
          />

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
              <span className="text-xs text-ink-muted block font-medium">Total Returning Patients</span>
              <span className="text-xl font-bold font-mono text-ink mt-0.5 block">
                {summary.totalScheduledPatients} patients
              </span>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
              <span className="text-xs text-ink-muted block font-medium">Minors Prioritized</span>
              <span className="text-xl font-bold font-mono text-brand mt-0.5 block">
                {summary.minorsCount} minors
              </span>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
              <span className="text-xs text-ink-muted block font-medium">Vials Saved</span>
              <span className="text-xl font-bold font-mono text-emerald-700 mt-0.5 block">
                {summary.vialsSaved} ({summary.savingsPercentage}%)
              </span>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
              <span className="text-xs text-ink-muted block font-medium">Walk-in Reserve</span>
              <span className="text-xl font-bold font-mono text-ink mt-0.5 block">
                20% / slot
              </span>
            </div>
          </div>

          {/* Slots Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-bold text-ink tracking-tight">
                  Grouped 30-Minute Windows
                </h2>
              </div>
              <span className="text-xs text-ink-muted">
                {groups.length} active time groups scheduled
              </span>
            </div>

            {groups.length === 0 ? (
              <EmptyState
                title="No Returning ID Patients Tomorrow"
                message="No patients with intradermal rabies vaccine scheduled for tomorrow at this clinic."
              />
            ) : (
              <div className="space-y-3.5">
                {groups.map((group) => (
                  <div
                    key={group.groupNumber}
                    className="bg-surface border border-border rounded-xl p-4 md:p-5 shadow-sm space-y-3"
                  >
                    {/* Slot Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-base font-bold text-ink">
                          {group.startTime} – {group.endTime}
                        </span>
                        <span className="text-xs bg-brandSoft text-brand px-2 py-0.5 rounded-md font-semibold">
                          {group.patients.length} patients batched
                        </span>
                        <span className="text-xs bg-surfaceSunken text-ink-muted px-2 py-0.5 rounded border border-border font-mono">
                          +{group.walkInReservedSlots} walk-in reserve
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-ink-muted bg-surfaceSunken px-2.5 py-1 rounded border border-border">
                        <span className="w-2 h-2 rounded-full bg-brand" aria-hidden="true" />
                        <span>Virtual Vial #{group.groupNumber}</span>
                      </div>
                    </div>

                    {/* Batched Patients List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                      {group.patients.map((patient) => (
                        <div
                          key={patient.doseId}
                          className="p-3 rounded-lg bg-surfaceSunken border border-border/70 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-ink truncate max-w-[150px]">
                              {patient.patientName}
                            </span>
                            <span className="px-2 py-0.5 rounded font-mono font-semibold bg-white border border-border text-brand">
                              Dose {patient.doseSeq}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-ink-muted text-[11px]">
                            <span>Phone: {patient.patientPhone}</span>
                            {patient.isMinor && (
                              <span className="text-brand font-semibold text-[10px] bg-brandSoft px-1.5 py-0.2 rounded">
                                Minor
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
              <span>Honest Baseline Calculation &amp; Clinical Safety Gate</span>
            </div>
            <p className="leading-relaxed">
              {summary.comparisonText} Intradermal (ID) rabies vaccine opened vials expire in 8 hours. Naive walk-in handling wastes {summary.vialsSaved} vials on average. Poora Teeka leaves 20% capacity in each window for unplanned walk-ins so no patient is turned away.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
