'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useCentre } from '@/lib/centreContext';

interface MissedDoseItem {
  dose_id: string;
  course_id: string;
  route: 'ID' | 'IM';
  seq: number;
  due_date: string;
  status: string;
  escalation_level?: 'critical' | 'priority' | 'routine' | string;
  dropout_risk?: number;
  version?: number;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  patient_language: string;
  patient_guardian_phone?: string | null;
}

type TriageFilter = 'ALL' | 'CRITICAL' | 'PRIORITY' | 'ROUTINE';

export default function MissedPage() {
  const { centreId } = useCentre();

  const [doses, setDoses] = useState<MissedDoseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TriageFilter>('ALL');
  const [actionDoseId, setActionDoseId] = useState<string | null>(null);
  const [recoveredIds, setRecoveredIds] = useState<Set<string>>(new Set());

  const fetchMissed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ count: number; doses: MissedDoseItem[] }>(
        `/doses/missed?centreId=${centreId}`
      );
      setDoses(data.doses || []);
    } catch (err) {
      console.error('Failed to fetch missed doses:', err);
      setError("Couldn't load missed doses — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [centreId]);

  useEffect(() => {
    fetchMissed();
  }, [fetchMissed]);

  const handleMarkGiven = async (dose: MissedDoseItem) => {
    if (actionDoseId) return;
    setActionDoseId(dose.dose_id);

    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `m_rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      await apiFetch(`/doses/${dose.dose_id}/given`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ version: dose.version ?? 1 }),
      });

      setRecoveredIds((prev) => new Set(prev).add(dose.dose_id));
      // Remove from list after brief delay
      setTimeout(() => {
        setDoses((prev) => prev.filter((d) => d.dose_id !== dose.dose_id));
      }, 500);
    } catch (err) {
      console.error('Failed to mark dose given:', err);
      alert('Could not record dose: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setActionDoseId(null);
    }
  };

  const filteredDoses = doses.filter((d) => {
    if (filter === 'ALL') return true;
    const level = (d.escalation_level || 'routine').toUpperCase();
    return level === filter;
  });

  const criticalCount = doses.filter((d) => d.escalation_level === 'critical').length;
  const priorityCount = doses.filter((d) => d.escalation_level === 'priority').length;
  const routineCount = doses.filter((d) => !d.escalation_level || d.escalation_level === 'routine').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Missed Dose Recovery
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-mono">
              Jev AI Triage
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            Overdue patients flagged by sweep and prioritized by dropout risk.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchMissed}
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          <span>{loading ? 'Sweeping...' : 'Refresh Queue'}</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'ALL'
              ? 'bg-brand text-white'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surfaceSunken'
          }`}
        >
          All ({doses.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('CRITICAL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'CRITICAL'
              ? 'bg-red-600 text-white'
              : 'bg-surface text-red-700 hover:bg-red-50 border border-red-200'
          }`}
        >
          Critical ({criticalCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter('PRIORITY')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'PRIORITY'
              ? 'bg-amber-600 text-white'
              : 'bg-surface text-amber-700 hover:bg-amber-50 border border-amber-200'
          }`}
        >
          Priority ({priorityCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter('ROUTINE')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'ROUTINE'
              ? 'bg-emerald-600 text-white'
              : 'bg-surface text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
          }`}
        >
          Routine ({routineCount})
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-urgentBg border border-urgent/30 flex items-start justify-between gap-3 text-sm text-urgent font-medium">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchMissed}
            className="px-3 py-1 bg-white text-urgent rounded-lg border border-urgent/40 text-xs font-bold hover:bg-urgentBg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !doses.length && (
        <div className="space-y-3">
          <LoadingSkeleton variant="row" count={4} />
        </div>
      )}

      {/* Doses List */}
      {!loading && filteredDoses.length === 0 && (
        <div className="pt-8">
          <EmptyState
            title="All Patients on Track"
            message="Nothing missed in this category. Everyone's schedule is up to date."
          />
        </div>
      )}

      {!loading && filteredDoses.length > 0 && (
        <div className="space-y-3">
          {filteredDoses.map((dose) => {
            const isRecovered = recoveredIds.has(dose.dose_id);
            const level = dose.escalation_level || 'routine';
            const riskPct = dose.dropout_risk ? Math.round(dose.dropout_risk * 100) : 45;

            return (
              <div
                key={dose.dose_id}
                className={`bg-surface border rounded-xl p-5 shadow-sm transition-all duration-300 ${
                  isRecovered ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
                } ${
                  level === 'critical'
                    ? 'border-red-300 bg-red-50/30'
                    : level === 'priority'
                    ? 'border-amber-300 bg-amber-50/20'
                    : 'border-border'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Patient & Overdue info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold text-ink tracking-tight">
                        {dose.patient_name}
                      </h3>

                      {/* Jev Triage Badge */}
                      {level === 'critical' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-800 bg-red-100 px-2.5 py-0.5 rounded-full border border-red-300">
                          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                          Critical Urgency
                        </span>
                      )}
                      {level === 'priority' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-600" />
                          Priority Call
                        </span>
                      )}
                      {level === 'routine' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                          Routine Reminder
                        </span>
                      )}

                      <span className="text-xs font-mono font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        Due {dose.due_date}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                      <span className="font-semibold text-brand">
                        Dose {dose.seq} ({dose.route})
                      </span>
                      <span>•</span>
                      <span>
                        Phone:{' '}
                        <a
                          href={`tel:${dose.patient_phone}`}
                          className="font-mono text-ink font-semibold hover:underline"
                        >
                          {dose.patient_phone}
                        </a>
                      </span>
                      {dose.patient_guardian_phone && (
                        <>
                          <span>•</span>
                          <span>Guardian: {dose.patient_guardian_phone}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="font-mono font-medium">
                        Dropout Risk: <strong>{riskPct}%</strong>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <a
                      href={`tel:${dose.patient_phone}`}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-surface border border-border hover:bg-surfaceSunken text-ink transition-colors"
                    >
                      Call Patient
                    </a>

                    <button
                      type="button"
                      onClick={() => handleMarkGiven(dose)}
                      disabled={actionDoseId === dose.dose_id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-brand hover:bg-emerald-800 text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {actionDoseId === dose.dose_id ? (
                        <span>Recording...</span>
                      ) : (
                        <span>Mark Recovered (Given)</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
