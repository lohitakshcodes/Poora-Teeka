'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { PROTOCOLS, type Patient, type Course, type Dose, type ProtocolMetadata } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Toast } from '@/components/Toast';
import { useCentre } from '@/lib/centreContext';

type SupportedLanguage = 'hi' | 'mr' | 'en';

export default function RegisterPage() {
  const { centreId } = useCentre();

  // Form fields
  const [name, setName] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('hi');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [protocolId, setProtocolId] = useState<string>('IN-UTRC-ID-v1');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdCourse, setCreatedCourse] = useState<Course | null>(null);
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null);
  const [showToast, setShowToast] = useState(false);

  // Clean phone input
  const cleanDigits = (val: string) => val.replace(/\D/g, '');
  const phoneDigits = cleanDigits(phoneRaw);
  const isPhoneValid = phoneDigits.length === 10 || (phoneDigits.length === 12 && phoneDigits.startsWith('91'));
  const isFormValid = name.trim().length >= 2 && isPhoneValid;

  // Format phone display cleanly as user types
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = cleanDigits(raw);
    if (digits.length <= 10) {
      setPhoneRaw(digits);
    } else if (digits.length <= 12 && digits.startsWith('91')) {
      setPhoneRaw(digits.slice(2));
    }
  };

  const getE164Phone = (digits: string) => {
    const last10 = digits.slice(-10);
    return `+91${last10}`;
  };

  const resetForm = () => {
    setName('');
    setPhoneRaw('');
    setLanguage('hi');
    setGuardianPhone('');
    setProtocolId('IN-UTRC-ID-v1');
    setCreatedCourse(null);
    setRegisteredPatient(null);
    setErrorMessage(null);
    setShowToast(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `pt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const phoneE164 = getE164Phone(phoneDigits);
    const guardianE164 = guardianPhone.trim() ? getE164Phone(cleanDigits(guardianPhone)) : undefined;

    try {
      // Step 1: POST /patients
      const patient = await apiFetch<Patient>('/patients', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone_e164: phoneE164,
          language,
          guardian_phone: guardianE164 ?? null,
          centre_id: centreId,
        }),
      });

      // Step 2: POST /courses with day0 = today's date (YYYY-MM-DD)
      const day0 = new Date().toISOString().split('T')[0];
      const selectedProto = PROTOCOLS.find((p) => p.id === protocolId) || PROTOCOLS[0];
      const dbProtocolId = selectedProto.dbId;

      const courseRes = await apiFetch<any>('/courses', {
        method: 'POST',
        headers: {
          'Idempotency-Key': `${idempotencyKey}-crs`,
        },
        body: JSON.stringify({
          patientId: patient.id,
          protocolId: dbProtocolId,
          centreId: centreId,
          day0,
        }),
      });

      const patientData: Patient = {
        id: patient.id,
        name: patient.name,
        phoneE164: (patient as any).phone_e164 || patient.phoneE164,
      };

      const rawDoses = courseRes.doses || courseRes.course?.doses || [];
      const totalDoses = rawDoses.length || selectedProto.visitOffsets.length;

      const normalizedCourse: Course = {
        id: courseRes.course?.id || courseRes.id,
        patientId: patient.id,
        protocolId: dbProtocolId,
        route: (courseRes.course?.route || courseRes.route || selectedProto.route) as 'ID' | 'IM',
        day0: courseRes.course?.day0 || courseRes.day0 || day0,
        createdAt: courseRes.course?.created_at || new Date().toISOString(),
        doses: rawDoses.map((d: any) => ({
          id: d.id,
          seq: d.seq,
          totalDoses,
          dueDate: d.due_date || d.dueDate,
          status: d.status,
          version: d.version ?? 1,
          slotStart: d.slot_start || d.slotStart || null,
          patient: {
            id: patient.id,
            name: patient.name,
            phoneE164: patientData.phoneE164,
          },
        })),
      };

      // Step 3: Success state with generated dose calendar
      setRegisteredPatient(patientData);
      setCreatedCourse(normalizedCourse);
      setShowToast(true);
    } catch (err) {
      console.error('Registration failed:', err);
      // Clinical design copy: never show a raw error object
      setErrorMessage("Couldn't save that — check the connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to format friendly dates
  const formatFriendlyDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Calculate human day label for dose sequence
  const getDoseDayLabel = (dose: Dose, totalDoses: number) => {
    const proto = PROTOCOLS.find((p) => p.id === createdCourse?.protocolId || p.dbId === createdCourse?.protocolId);
    if (proto) {
      if (proto.id === 'IN-BCG-v1') {
        return 'Birth Dose (Day 0)';
      }
      if (proto.id === 'IN-HEPB-IM-v1') {
        switch (dose.seq) {
          case 1: return 'Dose 1 (Day 0 - Today)';
          case 2: return 'Dose 2 (Month 1 - Day 30)';
          case 3: return 'Dose 3 (Month 6 - Day 180)';
        }
      }
    }
    if (totalDoses === 4) {
      // ID Protocol (0, 3, 7, 28)
      switch (dose.seq) {
        case 1: return 'Day 0 (Today)';
        case 2: return 'Day 3';
        case 3: return 'Day 7';
        case 4: return 'Day 28';
      }
    } else {
      // IM Protocol (0, 3, 7, 14, 28)
      switch (dose.seq) {
        case 1: return 'Day 0 (Today)';
        case 2: return 'Day 3';
        case 3: return 'Day 7';
        case 4: return 'Day 14';
        case 5: return 'Day 28';
      }
    }
    return `Dose ${dose.seq}`;
  };

  const getDoseDayNumber = (seq: number, totalDoses: number) => {
    const proto = PROTOCOLS.find((p) => p.id === createdCourse?.protocolId || p.dbId === createdCourse?.protocolId);
    if (proto?.id === 'IN-HEPB-IM-v1') {
      switch (seq) {
        case 1: return 0;
        case 2: return 30;
        case 3: return 180;
        default: return 0;
      }
    }
    if (totalDoses === 4) {
      switch (seq) {
        case 1: return 0;
        case 2: return 3;
        case 3: return 7;
        case 4: return 28;
        default: return 0;
      }
    } else {
      switch (seq) {
        case 1: return 0;
        case 2: return 3;
        case 3: return 7;
        case 4: return 14;
        case 5: return 28;
        default: return 0;
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Toast Confirmation (Motion Budget #4) */}
      {showToast && (
        <Toast
          message="Patient registered & vaccination course scheduled!"
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}

      {/* Page Header */}
      <div className="border-b border-border/80 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
            Register Patient
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Initiate a vaccination course (Rabies PEP, Tuberculosis BCG, or Hepatitis B)
          </p>
        </div>
        <Link
          href="/app"
          className="text-xs font-semibold text-brand hover:underline self-start sm:self-center"
        >
          ← Back to Today&apos;s Queue
        </Link>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-urgentBg border border-urgent/30 flex items-start gap-3">
          <svg className="w-5 h-5 text-urgent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 8.25h.008v.008H12v-.008z" />
          </svg>
          <div className="flex-1 text-sm text-urgent font-medium">
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="mt-2 text-xs font-bold underline hover:opacity-80 cursor-pointer"
            >
              Dismiss and retry
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS STATE: Generated Dose Calendar */}
      {createdCourse && registeredPatient ? (
        <div className="space-y-6">
          {/* Success Banner */}
          <div className="bg-brandSoft/70 border border-brand/30 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-ink tracking-tight">
                    Course Scheduled Successfully
                  </h2>
                  <p className="text-xs font-mono text-brand font-medium">
                    Patient ID: {registeredPatient.id} • Course ID: {createdCourse.id}
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-brand text-white shadow-xs font-mono">
                Route: {createdCourse.route}
              </span>
            </div>

            {/* Patient Meta Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs border-t border-brand/20">
              <div>
                <span className="text-ink-muted block">Patient</span>
                <span className="font-bold text-ink text-sm">{registeredPatient.name}</span>
              </div>
              <div>
                <span className="text-ink-muted block">Phone</span>
                <span className="font-mono font-semibold text-ink text-sm">{registeredPatient.phoneE164}</span>
              </div>
              <div>
                <span className="text-ink-muted block">Protocol</span>
                <span className="font-semibold text-ink text-sm">
                  {PROTOCOLS.find((p) => p.id === createdCourse.protocolId || p.dbId === createdCourse.protocolId)?.name || (createdCourse.route === 'ID' ? 'Intradermal (ID)' : 'Intramuscular (IM)')}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block">Reminder Channel</span>
                <span className="font-semibold text-brand text-sm">WhatsApp &amp; Voice</span>
              </div>
            </div>
          </div>

          {/* Generated Dose Calendar as Vertical Timeline */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Generated Dose Schedule
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fixed clinical schedule ({createdCourse.doses.length} visits). Automated reminders queued via transactional outbox.
                </p>
              </div>
              <span className="text-xs font-mono bg-slate-100 px-3 py-1 rounded border border-slate-200 text-slate-600 font-medium">
                Day 0: {formatFriendlyDate(createdCourse.day0)}
              </span>
            </div>

            {/* Vertical Timeline per spec:
                - Vertical line on the left (border-l-2 border-emerald-200)
                - Each dose as a dot (w-3 h-3 rounded-full bg-emerald-500) connected to a card showing: "Dose N — Day X — [date]"
                - Dose 1 dot is filled emerald, rest are outline only */}
            <div className="relative pl-6 border-l-2 border-emerald-200 space-y-4 ml-3 my-4">
              {createdCourse.doses.map((dose) => {
                const dayNumber = getDoseDayNumber(dose.seq, createdCourse.doses.length);
                const isDoseOne = dose.seq === 1;
                const formattedDate = formatFriendlyDate(dose.dueDate);

                return (
                  <div key={dose.id} className="relative">
                    {/* Dot on the vertical line */}
                    <div
                      className={`absolute -left-[31px] top-4 w-3 h-3 rounded-full ring-4 ring-slate-50 transition-colors ${
                        isDoseOne
                          ? 'bg-emerald-500'
                          : 'border-2 border-emerald-500 bg-white'
                      }`}
                      aria-hidden="true"
                    />

                    {/* Card showing: "Dose N — Day X — [date]" */}
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-slate-900 text-base">
                          Dose {dose.seq} — Day {dayNumber} — {formattedDate}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isDoseOne
                            ? 'Administer immediately at clinic counter'
                            : 'Automated WhatsApp & Voice reminder queued'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <StatusBadge status={dose.status} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reassurance note */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2.5">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-6-4.5h12m-12 9h12" />
              </svg>
              <span>
                First dose is marked <strong>DUE</strong> today. WhatsApp reminder templates will be dispatched in{' '}
                <strong>{language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : 'English'}</strong> prior to subsequent due dates.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer inline-flex items-center justify-center"
            >
              + Register Another Patient
            </button>
            <Link
              href="/app"
              className="w-full sm:w-auto min-h-[48px] text-center px-6 py-3 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors shadow-sm inline-flex items-center justify-center"
            >
              View Today&apos;s Clinic Queue →
            </Link>
          </div>
        </div>
      ) : (
        /* REGISTRATION FORM */
        <form onSubmit={handleSubmit} className="space-y-6 bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          {/* Patient Full Name */}
          <div className="space-y-2">
            <label htmlFor="patient-name" className="block text-sm font-bold text-ink">
              Patient Full Name <span className="text-urgent">*</span>
            </label>
            <input
              id="patient-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-ink text-base placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-all"
            />
          </div>

          {/* Phone Number with +91 indicator */}
          <div className="space-y-2">
            <label htmlFor="patient-phone" className="block text-sm font-bold text-ink">
              Phone Number <span className="text-urgent">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 font-mono text-sm font-bold text-ink-muted select-none">
                +91
              </span>
              <input
                id="patient-phone"
                type="tel"
                required
                value={phoneRaw}
                onChange={handlePhoneChange}
                placeholder="98765 43210"
                maxLength={10}
                className="w-full pl-14 pr-4 py-3 rounded-xl border border-border bg-surface text-ink text-base font-mono placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-all"
              />
            </div>
            <p className="text-xs text-ink-muted">
              10-digit mobile number for WhatsApp &amp; Polly automated voice reminders.
            </p>
          </div>

          {/* Language Preference */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-ink">
              Reminder Language
            </label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Preferred Reminder Language">
              {(
                [
                  { id: 'hi', label: 'हिन्दी', desc: 'Hindi' },
                  { id: 'mr', label: 'मराठी', desc: 'Marathi' },
                  { id: 'en', label: 'English', desc: 'English' },
                ] as const
              ).map((item) => {
                const isSelected = language === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setLanguage(item.id)}
                    className={`py-2.5 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand text-white border-brand shadow-xs font-bold'
                        : 'bg-surfaceSunken text-ink border-border hover:bg-slate-100 font-medium'
                    }`}
                  >
                    <span className="block text-sm leading-tight">{item.label}</span>
                    <span className={`text-[11px] block mt-0.5 ${isSelected ? 'text-white/80' : 'text-ink-muted'}`}>
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Guardian's Phone (Optional) */}
          <div className="space-y-2">
            <label htmlFor="guardian-phone" className="block text-sm font-bold text-ink">
              Guardian&apos;s phone (if patient is a minor)
            </label>
            <input
              id="guardian-phone"
              type="tel"
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(cleanDigits(e.target.value).slice(0, 10))}
              placeholder="Optional 10-digit number"
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-ink text-base font-mono placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-all"
            />
            <p className="text-xs text-ink-muted">
              Optional alternate contact for minor patient notifications.
            </p>
          </div>

          {/* Protocol Selector as clear grouped cards */}
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-bold text-ink">
                Vaccination Protocol <span className="text-urgent">*</span>
              </label>
              <p className="text-xs text-ink-muted mt-0.5">
                Clinical choice (fixed at creation per Hard Rule #2; route cannot change after enrollment).
              </p>
            </div>

            {/* Category: Rabies Post-Exposure Prophylaxis */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-urgent" />
                Rabies Post-Exposure Prophylaxis (PEP)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Rabies ID */}
                <button
                  type="button"
                  onClick={() => setProtocolId('IN-UTRC-ID-v1')}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative cursor-pointer ${
                    protocolId === 'IN-UTRC-ID-v1'
                      ? 'border-brand bg-brandSoft/50 shadow-sm'
                      : 'border-border bg-surface hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-ink">
                      Rabies Intradermal (ID)
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-brand text-white px-2 py-0.5 rounded-full font-mono">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-brand mb-1">
                    4 visits • 8h vial countdown • Shared vial batching
                  </p>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Days: <strong>0, 3, 7, 28</strong>. Updated Thai Red Cross 2-site ID regimen. Saves up to 80% vaccine vial capacity.
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                    <span className="w-2 h-2 rounded-full bg-brand" aria-hidden="true" />
                    <span>IN-UTRC-ID-v1</span>
                  </div>
                </button>

                {/* Rabies IM */}
                <button
                  type="button"
                  onClick={() => setProtocolId('IN-ESSEN-IM-v1')}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative cursor-pointer ${
                    protocolId === 'IN-ESSEN-IM-v1'
                      ? 'border-brand bg-brandSoft/50 shadow-sm'
                      : 'border-border bg-surface hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-ink">
                      Rabies Intramuscular (IM)
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono">
                      Standard
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-ink-muted mb-1">
                    5 visits • 1 vial per visit
                  </p>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Days: <strong>0, 3, 7, 14, 28</strong>. Essen regimen (1 full dose in deltoid per visit).
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                    <span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden="true" />
                    <span>IN-ESSEN-IM-v1</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Category: Tuberculosis (BCG) */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Tuberculosis (Universal Immunization Programme)
              </span>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => setProtocolId('IN-BCG-v1')}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative cursor-pointer ${
                    protocolId === 'IN-BCG-v1'
                      ? 'border-brand bg-brandSoft/50 shadow-sm'
                      : 'border-border bg-surface hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink">
                        BCG Vaccine (Newborn Single-Dose ID)
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono">
                        20 Doses/Vial
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-mono">
                      6h Discard Window
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-brand mb-1">
                    1 visit (Day 0 at birth) • Intradermal • Freeze-dried multi-dose vial
                  </p>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Reconstituted freeze-dried vaccine. Must be discarded within 6 hours. Shares identical reservation concurrency logic with rabies ID.
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" aria-hidden="true" />
                    <span>IN-BCG-v1</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Category: Hepatitis B */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Hepatitis B (Universal Immunization Programme)
              </span>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => setProtocolId('IN-HEPB-IM-v1')}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative cursor-pointer ${
                    protocolId === 'IN-HEPB-IM-v1'
                      ? 'border-brand bg-brandSoft/50 shadow-sm'
                      : 'border-border bg-surface hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink">
                        Hepatitis B (3-Dose Schedule IM)
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono">
                        3 Visits (0, 30, 180d)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono">
                      28-Day Open Vial
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-ink-muted mb-1">
                    Birth/Dose 1 (Day 0), Dose 2 (Month 1), Dose 3 (Month 6) • Intramuscular
                  </p>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Liquid suspension vaccine. Remains usable up to 28 days once opened under cold chain. Uses identical transactional dose calendar &amp; outbox reminder engine.
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                    <span className="w-2 h-2 rounded-full bg-blue-600" aria-hidden="true" />
                    <span>IN-HEPB-IM-v1</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-ink-muted">
              Both patient record and course will be stored in PostgreSQL with transactional outbox reminders.
            </p>

            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={`min-h-[48px] px-8 py-3 rounded-lg text-base font-semibold transition-all shadow-sm flex items-center justify-center gap-2.5 cursor-pointer shrink-0 ${
                isFormValid && !isSubmitting
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <span>Create Course &amp; Generate Schedule</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
