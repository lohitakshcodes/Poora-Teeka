'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import type { Dose, TodayDosesResponse } from '@/lib/types';
import { DoseCard } from '@/components/DoseCard';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';

// ────────────────────────────────────────────────────────────────────────────
// Route filter type
// ────────────────────────────────────────────────────────────────────────────
type RouteFilter = 'ALL' | 'ID' | 'IM';

// Route is inferred from route property or totalDoses: ID protocol = 4 doses, IM protocol = 5 doses
function getDoseRoute(dose: Dose): 'ID' | 'IM' {
  if (dose.route) return dose.route;
  return dose.totalDoses === 5 ? 'IM' : 'ID';
}

// ────────────────────────────────────────────────────────────────────────────
// Today's Queue page
// ────────────────────────────────────────────────────────────────────────────
export default function TodayPage() {
  const CENTRE_ID =
    process.env.NEXT_PUBLIC_CENTRE_ID || 'a0000000-0000-0000-0000-000000000001';

  const [doses, setDoses] = useState<Dose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RouteFilter>('ALL');

  // Track per-dose 409 conflict banners
  const [conflictIds, setConflictIds] = useState<Set<string>>(new Set());

  // ── Fetch today's queue ───────────────────────────────────────────────────
  const fetchDoses = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = await apiFetch<any>(
        `/doses/today?centreId=${CENTRE_ID}&date=${today}`
      );
      const rawList = data.doses ?? [];
      const normalized: Dose[] = rawList.map((raw: any) => ({
        id: raw.id || raw.dose_id,
        seq: raw.seq,
        totalDoses: raw.totalDoses ?? (raw.route === 'IM' || raw.protocol_id === 'essen_im' ? 5 : 4),
        dueDate: raw.dueDate || raw.due_date || today,
        status: raw.status,
        version: raw.version ?? 1,
        slotStart: raw.slotStart || raw.slot_start || null,
        route: (raw.route || (raw.protocol_id === 'essen_im' ? 'IM' : 'ID')) as 'ID' | 'IM',
        patient: raw.patient ?? {
          id: raw.patient_id || '',
          name: raw.patient_name || 'Patient',
          phoneE164: raw.patient_phone || raw.phone_e164 || '',
        },
      }));
      setDoses(normalized);
    } catch (err) {
      console.error('Failed to fetch doses:', err);
      setError("Couldn't load today's queue — check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [CENTRE_ID]);

  useEffect(() => {
    fetchDoses();
  }, [fetchDoses]);

  // ── Record a dose as given ────────────────────────────────────────────────
  const handleMarkGiven = useCallback(
    async (doseId: string) => {
      const dose = doses.find((d) => d.id === doseId);
      if (!dose) return;

      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `mg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      try {
        await apiFetch(`/doses/${doseId}/given`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          // version is mandatory — backend returns HTTP 400 if omitted (optimistic locking)
          body: JSON.stringify({ version: dose.version ?? 1 }),
        });

        // Optimistic update: mark GIVEN, bump version
        setDoses((prev) =>
          prev.map((d) =>
            d.id === doseId ? { ...d, status: 'GIVEN', version: d.version + 1 } : d
          )
        );
        // Clear stale conflict banner for this dose
        setConflictIds((prev) => {
          const next = new Set(prev);
          next.delete(doseId);
          return next;
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Another device already recorded this dose — surface the conflict
          setConflictIds((prev) => new Set(prev).add(doseId));
          // Re-fetch so this device sees the authoritative server state
          await fetchDoses();
        } else {
          throw err; // DoseCard will handle other errors via its own error boundary
        }
      }
    },
    [doses, fetchDoses]
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const filteredDoses = doses.filter((d) => {
    if (filter === 'ALL') return true;
    return getDoseRoute(d) === filter;
  });

  const dueCount = doses.filter((d) => d.status === 'DUE').length;
  const givenCount = doses.filter((d) => d.status === 'GIVEN').length;
  const totalActionable = doses.filter((d) => d.status !== 'MISSED').length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/80 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Today&apos;s Doses
            </h1>
            {!loading && dueCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-statusDue/15 text-statusDue border border-statusDue/25 font-mono">
                {dueCount} due
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {today} • Civil Hospital Clinic #1 • Anti-Rabies Vaccine Schedule
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          {/* Progress pill */}
          {!loading && doses.length > 0 && (
            <span className="text-xs font-semibold text-ink-muted bg-surface border border-border px-3 py-1.5 rounded-xl">
              {givenCount}/{totalActionable} given
            </span>
          )}

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchDoses}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-surface text-ink text-xs font-semibold hover:bg-surfaceSunken transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 text-brand ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            <span>{loading ? 'Loading...' : 'Refresh'}</span>
          </button>

          {/* New patient shortcut */}
          <Link
            href="/app/register"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-emerald-800 transition-colors shadow-xs"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Patient
          </Link>
        </div>
      </div>

      {/* ── Error Banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-xl bg-urgentBg border border-urgent/30 flex items-start justify-between gap-3 text-sm text-urgent font-medium">
          <div className="flex items-center gap-2.5">
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 8.25h.008v.008H12v-.008z"
              />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchDoses}
            className="px-3 py-1 bg-white text-urgent rounded-lg border border-urgent/40 text-xs font-bold hover:bg-urgentBg cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Route Filter Tabs ─────────────────────────────────────────────── */}
      {!loading && doses.length > 0 && (
        <div className="flex items-center gap-1.5 p-1 bg-surfaceSunken rounded-xl border border-border w-fit">
          {(['ALL', 'ID', 'IM'] as RouteFilter[]).map((tab) => {
            const count =
              tab === 'ALL'
                ? doses.length
                : doses.filter((d) => getDoseRoute(d) === tab).length;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filter === tab
                    ? 'bg-surface text-ink shadow-xs border border-border'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {tab === 'ALL' ? 'All routes' : tab}{' '}
                <span
                  className={`font-mono ${filter === tab ? 'text-brand' : 'text-ink-muted'}`}
                >
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Loading Skeleton ──────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          <LoadingSkeleton variant="dose-card" count={5} />
        </div>
      )}

      {/* ── Dose List ─────────────────────────────────────────────────────── */}
      {!loading && filteredDoses.length > 0 && (
        <div className="space-y-3">
          {filteredDoses.map((dose) => (
            <React.Fragment key={dose.id}>
              {/* Per-dose 409 conflict banner */}
              {conflictIds.has(dose.id) && (
                <div className="px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-800 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  Dose already recorded by another device. Queue refreshed — see updated status below.
                </div>
              )}
              <DoseCard
                dose={dose}
                onMarkGiven={
                  dose.status === 'DUE' || dose.status === 'SCHEDULED'
                    ? handleMarkGiven
                    : undefined
                }
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Empty State ───────────────────────────────────────────────────── */}
      {!loading && !error && filteredDoses.length === 0 && (
        <div className="pt-8">
          {filter !== 'ALL' ? (
            <EmptyState
              title={`No ${filter} doses today`}
              message={`No ${filter === 'ID' ? 'intradermal' : 'intramuscular'} doses scheduled for today.`}
            />
          ) : (
            <EmptyState
              title="All Caught Up"
              message="No doses due today. Quiet one."
              action={{ label: 'Register New Patient', href: '/app/register' }}
            />
          )}
        </div>
      )}
    </div>
  );
}
