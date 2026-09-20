'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { MetricNumber } from '@/components/MetricNumber';
import { FunnelBar } from '@/components/FunnelBar';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useCentre } from '@/lib/centreContext';

interface FunnelItem {
  seq: number;
  label: string;
  total: number;
  given: number;
  due: number;
  missed: number;
  scheduled: number;
  completionRatePct: number;
}

interface MissedDoseItem {
  dose_id: string;
  seq: number;
  patient_name: string;
  patient_phone: string;
  escalation_level?: 'critical' | 'priority' | 'routine' | string;
  dropout_risk?: number;
}

interface MetricsData {
  centre?: {
    id: string;
    name: string;
    city: string;
  };
  summary?: {
    centreId: string;
    generatedAt: string;
  };
  completionFunnel: {
    overallCompletionRatePct?: number;
    sequences: FunnelItem[];
    totalCoursesTracked: number;
  };
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
  reminderDelivery: {
    totalReminders: number;
    sentReminders: number;
    failedReminders: number;
    pendingReminders: number;
    preReminders: number;
    missedAlerts: number;
    deliveryRatePct: number;
  };
}

export default function DashboardPage() {
  const { centreId, activeCentre } = useCentre();

  const [data, setData] = useState<MetricsData | null>(null);
  const [missedDoses, setMissedDoses] = useState<MissedDoseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, missedRes] = await Promise.all([
        apiFetch<MetricsData>(`/metrics?centreId=${centreId}`),
        apiFetch<{ count: number; doses: MissedDoseItem[] }>(`/doses/missed?centreId=${centreId}`).catch(() => ({
          count: 0,
          doses: [],
        })),
      ]);
      setData(metricsRes);
      setMissedDoses(missedRes.doses || []);
    } catch (err) {
      console.error('Failed to fetch dashboard metrics:', err);
      setError("Couldn't load clinic metrics — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [centreId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const maxScheduled = data?.completionFunnel.sequences.reduce(
    (max, s) => Math.max(max, s.scheduled),
    0
  ) || 1;

  const criticalMissed = missedDoses.filter((d) => d.escalation_level === 'critical');
  const priorityMissed = missedDoses.filter((d) => d.escalation_level === 'priority');
  const routineMissed = missedDoses.filter((d) => !d.escalation_level || d.escalation_level === 'routine');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Clinic Dashboard
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brandSoft text-brand font-mono">
              Live Telemetry
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            {data?.centre?.name || activeCentre.name} • {data?.centre?.city || activeCentre.city}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchMetrics}
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
          <span>{loading ? 'Refreshing...' : 'Refresh Metrics'}</span>
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-urgentBg border border-urgent/30 flex items-start justify-between gap-3 text-sm text-urgent font-medium">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchMetrics}
            className="px-3 py-1 bg-white text-urgent rounded-lg border border-urgent/40 text-xs font-bold hover:bg-urgentBg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <LoadingSkeleton variant="metric-card" count={4} />
          </div>
          <LoadingSkeleton variant="row" count={5} />
        </div>
      )}

      {/* Main Content */}
      {data && (
        <div className="space-y-6">
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Vials Opened vs Theoretical Min */}
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-2">
              <span className="text-xs text-ink-muted font-medium block">
                Vials Opened Today
              </span>
              <div className="flex items-baseline gap-2">
                <MetricNumber
                  value={data.vialsToday.vialsOpenedToday}
                  className="text-3xl text-ink"
                />
                <span className="text-xs text-ink-muted">
                  min: {data.vialsToday.theoreticalMinVials}
                </span>
              </div>
              <p className="text-[11px] text-brand font-medium">
                {data.vialsToday.vialEfficiencyPct}% capacity utilization
              </p>
            </div>

            {/* Card 2: Vaccine Discarded */}
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-2">
              <span className="text-xs text-ink-muted font-medium block">
                Vaccine Discarded Today
              </span>
              <div className="flex items-baseline gap-1.5">
                <MetricNumber
                  value={data.vialsToday.mlDiscardedToday}
                  decimals={1}
                  className="text-3xl text-ink"
                />
                <span className="text-sm font-semibold text-ink-muted">mL</span>
              </div>
              <p className="text-[11px] text-ink-muted">
                {data.vialsToday.unitsDiscardedToday} unused ID units expired
              </p>
            </div>

            {/* Card 3: Reminder Delivery Rate */}
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-2">
              <span className="text-xs text-ink-muted font-medium block">
                Reminder Delivery Rate
              </span>
              <div className="flex items-baseline gap-1">
                <MetricNumber
                  value={data.reminderDelivery.deliveryRatePct}
                  decimals={1}
                  className="text-3xl text-ink"
                />
                <span className="text-sm font-semibold text-ink-muted">%</span>
              </div>
              <p className="text-[11px] text-ink-muted">
                {data.reminderDelivery.sentReminders} sent • {data.reminderDelivery.failedReminders} failed
              </p>
            </div>

            {/* Card 4: Patients Tracked */}
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-2">
              <span className="text-xs text-ink-muted font-medium block">
                Active Courses Tracked
              </span>
              <div className="flex items-baseline gap-1">
                <MetricNumber
                  value={data.completionFunnel.totalCoursesTracked}
                  className="text-3xl text-ink"
                />
                <span className="text-xs text-ink-muted">courses</span>
              </div>
              <p className="text-[11px] text-brand font-medium">
                Zero loss-to-follow-up target
              </p>
            </div>
          </div>

          {/* Completion Funnel */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3">
              <div>
                <h2 className="text-lg font-bold text-ink tracking-tight">
                  Dose Completion Funnel
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Percentage of patients completing each visit sequence. Most dropouts occur at Dose 3 &amp; 4.
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-surfaceSunken text-ink-muted border border-border">
                {data.completionFunnel.totalCoursesTracked} Total Courses
              </span>
            </div>

            <div className="space-y-4">
              {data.completionFunnel.sequences.map((step) => (
                <FunnelBar
                  key={step.seq}
                  step={{
                    seq: step.seq,
                    given: step.given,
                    scheduled: step.scheduled,
                  }}
                  maxScheduled={maxScheduled}
                />
              ))}
            </div>
          </div>

          {/* Jev System One Triage & Missed Dose Recovery Banner */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-lg font-bold text-ink tracking-tight">
                  Missed Dose Recovery &amp; Jev AI Triage
                </h2>
              </div>
              <Link
                href="/app/missed"
                className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1"
              >
                <span>View Full Missed Queue ({missedDoses.length})</span>
                <span>&rarr;</span>
              </Link>
            </div>

            <p className="text-xs text-ink-muted">
              Overdue doses are automatically swept every 5 minutes and evaluated by <strong>TypeSafe AI (Jev System One)</strong> for dropout probability and clinic escalation urgency.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-4 rounded-xl bg-red-50/70 border border-red-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-800 uppercase tracking-wider">Critical</span>
                  <span className="text-lg font-bold font-mono text-red-900">{criticalMissed.length}</span>
                </div>
                <p className="text-[11px] text-red-700 mt-1">High dropout risk. Requires immediate nurse call.</p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Priority</span>
                  <span className="text-lg font-bold font-mono text-amber-900">{priorityMissed.length}</span>
                </div>
                <p className="text-[11px] text-amber-700 mt-1">Significant risk. Follow up with patient today.</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Routine</span>
                  <span className="text-lg font-bold font-mono text-emerald-900">{routineMissed.length}</span>
                </div>
                <p className="text-[11px] text-emerald-700 mt-1">Automated WhatsApp &amp; voice call sent.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
