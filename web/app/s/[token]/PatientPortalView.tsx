'use client';

import React, { useState } from 'react';
import { LanguageChip, type SupportedLanguage } from '@/components/LanguageChip';

export interface PatientStatusData {
  firstName: string;
  fullName: string;
  language: 'hi' | 'mr' | 'en';
  protocolLabel: string;
  vaccineId: string;
  dosesGiven: number;
  dosesTotal: number;
  nextDueDate: string | null;
  nextDoseSeq: number | null;
  centre: {
    id: string;
    name: string;
    city: string;
  };
  doses: Array<{
    id: string;
    seq: number;
    due_date: string;
    status: string;
  }>;
}

// Convert English digits to Devanagari digits (0-9 -> ०-९)
function toDevanagariDigits(str: string | number): string {
  const devanagariNums = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return String(str).replace(/[0-9]/g, (w) => devanagariNums[+w]);
}

// Format YYYY-MM-DD into a localized friendly date
function formatLocalizedDate(dateStr: string | null, lang: SupportedLanguage): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));

  const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthsHi = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'];

  const mIdx = dateObj.getUTCMonth();
  const d = dateObj.getUTCDate();

  if (lang === 'hi') {
    return `${toDevanagariDigits(d)} ${monthsHi[mIdx]}`;
  }
  if (lang === 'mr') {
    return `${toDevanagariDigits(d)} ${monthsMr[mIdx]}`;
  }
  return `${monthsEn[mIdx]} ${d}`;
}

// Common name transliterations for authentic vernacular experience
const DEVANAGARI_NAMES: Record<string, string> = {
  Pooja: 'पूजा',
  Ramesh: 'रमेश',
  Suresh: 'सुरेश',
  Gaurav: 'गौरव',
  Ritu: 'रितु',
  Kiran: 'किरण',
  Rohan: 'रोहन',
  Ananya: 'अनन्या',
  Naveen: 'नवीन',
  Sonal: 'सोनल',
  Manoj: 'मनोज',
  Geeta: 'गीता',
  Harish: 'हरीश',
  Arjun: 'अर्जुन',
  Kavya: 'काव्या',
  Priya: 'प्रिया',
};

function getLocalizedName(name: string, lang: SupportedLanguage): string {
  if (lang === 'en') return name;
  return DEVANAGARI_NAMES[name] || name;
}

export function PatientPortalView({
  initialData,
  token,
}: {
  initialData: PatientStatusData | null;
  token: string;
}) {
  const [data] = useState<PatientStatusData | null>(initialData);
  const [lang, setLang] = useState<SupportedLanguage>(
    (initialData?.language as SupportedLanguage) || 'mr'
  );

  // Derived display values
  const rawFirstName = data?.firstName || data?.fullName?.split(' ')[0] || 'Patient';
  const patientDisplayName = getLocalizedName(rawFirstName, lang);
  const dosesGiven = data?.dosesGiven ?? 0;
  const dosesTotal = data?.dosesTotal ?? 4;
  const isComplete = dosesGiven >= dosesTotal && dosesTotal > 0;
  const pct = Math.min(100, Math.round((dosesGiven / Math.max(1, dosesTotal)) * 100));
  const nextDateFormatted = data?.nextDueDate ? formatLocalizedDate(data.nextDueDate, lang) : '';
  const centreName = data?.centre ? `${data.centre.name}, ${data.centre.city}` : 'Anti-Rabies Clinic';
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(centreName)}`;

  // Translations with dynamic patient values
  const translations = {
    en: {
      greetingPrefix: 'Hi',
      greeting: `Hi ${patientDisplayName} 👋`,
      prompt: isComplete
        ? 'Your vaccination course is fully complete! 🎉'
        : 'Your next rabies vaccine dose is on',
      dateStr: nextDateFormatted || 'Scheduled soon',
      progress: isComplete
        ? `All ${dosesTotal} of ${dosesTotal} doses complete`
        : `Dose ${dosesGiven} of ${dosesTotal} complete`,
      reassurance: isComplete
        ? 'You are protected against rabies. Stay safe!'
        : 'The vaccine will be ready for you.',
      directions: 'Get directions →',
      help: 'Need help or missed your date? Call the clinic helpline: 1800-209-4357',
    },
    hi: {
      greetingPrefix: 'नमस्ते',
      greeting: `नमस्ते ${patientDisplayName} 👋`,
      prompt: isComplete
        ? 'आपका टीकाकरण कोर्स सफलतापूर्वक पूरा हो चुका है! 🎉'
        : 'आपकी अगली रेबीज वैक्सीन की खुराक है',
      dateStr: nextDateFormatted || 'जल्द निर्धारित',
      progress: isComplete
        ? `सभी ${toDevanagariDigits(dosesTotal)} खुराकें पूरी हुईं`
        : `${toDevanagariDigits(dosesTotal)} में से ${toDevanagariDigits(dosesGiven)} खुराक पूरी हुईं`,
      reassurance: isComplete
        ? 'आप रेबीज से सुरक्षित हैं। सुरक्षित रहें!'
        : 'वैक्सीन आपके लिए तैयार रखी जाएगी।',
      directions: 'रास्ता देखें →',
      help: 'मदद चाहिए या तारीख छूट गई? क्लीनिक हेल्पलाइन पर कॉल करें: 1800-209-4357',
    },
    mr: {
      greetingPrefix: 'नमस्कार',
      greeting: `नमस्कार ${patientDisplayName} 👋`,
      prompt: isComplete
        ? 'आपला लसीकरण कोर्स पूर्ण झाला आहे! 🎉'
        : 'तुमचा पुढील रेबीज लस डोस या दिवशी आहे',
      dateStr: nextDateFormatted || 'लवकरच नियोजित',
      progress: isComplete
        ? `सर्व ${toDevanagariDigits(dosesTotal)} डोस पूर्ण झाले`
        : `${toDevanagariDigits(dosesTotal)} पैकी ${toDevanagariDigits(dosesGiven)} डोस पूर्ण झाले`,
      reassurance: isComplete
        ? 'तुम्ही रेबीजपासून सुरक्षित आहात. सुरक्षित रहा!'
        : 'लस तुमच्यासाठी तयार ठेवली जाईल.',
      directions: 'मार्ग पहा →',
      help: 'मदत हवी आहे किंवा तारीख चुकली? क्लिनिक हेल्पलाइनवर कॉल करा: 1800-209-4357',
    },
  };

  const t = translations[lang];

  return (
    <main className="min-h-screen bg-surfaceSunken flex flex-col justify-between p-6 sm:p-10 max-w-lg mx-auto text-ink font-sans">
      {/* Top Bar: Brand & Language Switcher */}
      <div className="flex items-center justify-between pb-6 border-b border-border/70">
        <span className="text-xs font-bold text-brand uppercase tracking-wider font-mono">
          Poora Teeka
        </span>
        <LanguageChip activeLang={lang} onChangeLang={setLang} />
      </div>

      {/* Error / Not Found State */}
      {!data && (
        <div className="my-auto py-12 space-y-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-ink">Vaccination Record Not Found</h1>
            <p className="text-sm text-ink-muted">
              We couldn&apos;t find an active vaccination schedule for token: &ldquo;{token}&rdquo;. Please check the SMS or WhatsApp message sent to you.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border text-xs text-ink-muted">
            <p>Need assistance? Contact your primary anti-rabies clinic helpline.</p>
          </div>
        </div>
      )}

      {/* Main Warm Patient Card */}
      {data && (
        <div className="my-auto py-8 space-y-6">
          {/* 1. Patient's first name only, large, friendly */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight flex items-center gap-2 flex-wrap">
              <span>{t.greetingPrefix}</span>
              <span className="text-brand font-black underline decoration-brand/30 underline-offset-4">
                {patientDisplayName}
              </span>
              <span>👋</span>
            </h1>
            {/* 2. One clear, calm sentence */}
            <p className="text-lg sm:text-xl text-ink-muted leading-snug">
              {t.prompt}{' '}
              {!isComplete && (
                <strong className="text-brand font-bold">{t.dateStr}</strong>
              )}
              {!isComplete && '.'}
            </p>
          </div>

          {/* 3. Simple visual of progress dots */}
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-ink">{t.progress}</span>
              <span className="text-xs font-mono text-brand font-bold">
                {lang === 'hi' || lang === 'mr' ? toDevanagariDigits(pct) : pct}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              {Array.from({ length: Math.max(1, dosesTotal) }).map((_, idx) => {
                const isGiven = idx < dosesGiven;
                return (
                  <div
                    key={idx}
                    className={`h-3 flex-1 rounded-full transition-colors ${
                      isGiven ? 'bg-brand' : 'bg-surfaceSunken border border-border'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* 4. Centre Name and Directions */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-2 text-sm">
            <div className="flex items-start gap-2.5">
              <svg
                className="w-5 h-5 text-brand shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <div>
                <p className="font-semibold text-ink">{centreName}</p>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-brand hover:underline inline-block mt-1"
                >
                  {t.directions}
                </a>
              </div>
            </div>
          </div>

          {/* 5. Reassuring line */}
          <div className="p-4 rounded-xl bg-brandSoft/80 border border-brand/20 text-center">
            <p className="text-sm font-semibold text-brand">
              &ldquo;{t.reassurance}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Footer / Helpline */}
      <footer className="pt-6 border-t border-border/70 text-center text-xs text-ink-muted">
        <p>{t.help}</p>
      </footer>
    </main>
  );
}
