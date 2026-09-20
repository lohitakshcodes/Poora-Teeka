'use client';

import React, { useState } from 'react';
import type { Dose } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { apiFetch } from '@/lib/api';

interface DoseCardProps {
  dose: Dose;
  onMarkGiven?: (doseId: string) => Promise<void> | void;
  className?: string;
}

export function DoseCard({ dose, onMarkGiven, className = '' }: DoseCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // FHIR Modal State
  const [showFhirModal, setShowFhirModal] = useState(false);
  const [fhirData, setFhirData] = useState<any>(null);
  const [fhirLoading, setFhirLoading] = useState(false);
  const [fhirError, setFhirError] = useState<string | null>(null);
  const [fhirCopied, setFhirCopied] = useState(false);

  const status = isExiting ? 'GIVEN' : dose.status;

  // LEFT: a colored left border — green if GIVEN, amber if DUE, red if MISSED
  let borderLeftColor = 'border-l-slate-300';
  if (status === 'GIVEN') {
    borderLeftColor = 'border-l-emerald-500';
  } else if (status === 'DUE') {
    borderLeftColor = 'border-l-amber-500';
  } else if (status === 'MISSED') {
    borderLeftColor = 'border-l-red-500';
  }

  const patientName = dose.patient?.name || 'Patient';
  const totalDosesCount = dose.totalDoses || 4;

  const dueDateStr = dose.dueDate
    ? new Date(dose.dueDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Today';

  const formattedTime = dose.slotStart
    ? dose.slotStart.includes('T')
      ? new Date(dose.slotStart).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : dose.slotStart.slice(0, 5)
    : null;

  // Jev escalation badge (if status MISSED):
  // routine = yellow pill, priority = orange pill, critical = red pill with pulse animation
  const isMissed = status === 'MISSED';
  const escalation = ((dose as any).escalation_level || 'routine').toLowerCase();

  const handleMarkGiven = async () => {
    if (!onMarkGiven || isSubmitting || isExiting) return;
    setIsSubmitting(true);
    setIsExiting(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await onMarkGiven(dose.id);
    } catch (err) {
      setIsExiting(false);
      setIsSubmitting(false);
      throw err;
    }
  };

  const handleOpenFhir = async () => {
    setShowFhirModal(true);
    setFhirError(null);
    if (!fhirData) {
      setFhirLoading(true);
      try {
        const res = await apiFetch<any>(`/fhir/Immunization/${dose.id}`);
        setFhirData(res);
      } catch (err: any) {
        console.error('Failed to fetch FHIR record:', err);
        setFhirError(err.message || 'Failed to load FHIR record');
      } finally {
        setFhirLoading(false);
      }
    }
  };

  const handleCopyFhir = () => {
    if (!fhirData) return;
    navigator.clipboard.writeText(JSON.stringify(fhirData, null, 2));
    setFhirCopied(true);
    setTimeout(() => setFhirCopied(false), 2000);
  };

  return (
    <>
      <div
        className={`bg-white rounded-xl shadow-sm p-5 border border-slate-200/80 border-l-[6px] ${borderLeftColor} transition-all duration-300 space-y-4 ${
          isExiting
            ? 'opacity-0 -translate-x-6 scale-95 pointer-events-none'
            : 'opacity-100 translate-x-0 scale-100'
        } ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          {/* Patient and Sequence Info */}
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-semibold text-lg text-slate-900 tracking-tight">
                {patientName}
              </h3>
              <StatusBadge status={status} />
              {/* Jev escalation badge (if status MISSED) */}
              {isMissed && (
                <>
                  {escalation === 'critical' ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200 animate-pulse">
                      Jev: Critical
                    </span>
                  ) : escalation === 'priority' ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                      Jev: Priority
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
                      Jev: Routine
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span>Dose {dose.seq} of {totalDosesCount}</span>
              <span className="text-slate-300">•</span>
              <span>Due: {dueDateStr}</span>
              {formattedTime && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    Slot: {formattedTime}
                  </span>
                </>
              )}
              {dose.patient?.phoneE164 && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs text-slate-400 font-mono">
                    {dose.patient.phoneE164}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Top-right actions (FHIR record link if GIVEN) */}
          {status === 'GIVEN' && (
            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <button
                type="button"
                onClick={handleOpenFhir}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg border border-purple-200 transition-colors cursor-pointer"
                title="Inspect HL7 FHIR Release 4 ABDM Immunization Record"
              >
                <svg className="w-3.5 h-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
                <span>FHIR R4</span>
              </button>
            </div>
          )}
        </div>

        {/* Record Dose button: full width, emerald, 48px tall. Only show if status is DUE */}
        {status === 'DUE' && onMarkGiven && (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleMarkGiven}
              disabled={isSubmitting || isExiting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-4 py-3 min-h-[48px] h-12 flex items-center justify-center gap-2 text-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isExiting ? (
                <>
                  <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>Recorded</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>Record Dose</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* FHIR R4 Inspection Modal */}
      {showFhirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse" />
                <h3 className="text-base font-bold text-slate-900">
                  HL7 FHIR R4 Immunization Record
                </h3>
                <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                  ABDM / SNOMED CT
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowFhirModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Dose ID: {dose.id}</span>
                <span>GET /fhir/Immunization/{dose.id}</span>
              </div>

              {fhirLoading && (
                <div className="p-8 text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-500">Loading FHIR R4 standard payload...</p>
                </div>
              )}

              {fhirError && (
                <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
                  {fhirError}
                </div>
              )}

              {fhirData && (
                <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-auto max-h-[50vh] leading-relaxed border border-slate-800 selection:bg-purple-900 selection:text-white">
                  {JSON.stringify(fhirData, null, 2)}
                </pre>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Compliant with HL7 FHIR Release 4 and ABDM Immunization Profile
              </span>

              <div className="flex items-center gap-2">
                {fhirData && (
                  <button
                    type="button"
                    onClick={handleCopyFhir}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    <span>{fhirCopied ? 'Copied!' : 'Copy JSON'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowFhirModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
