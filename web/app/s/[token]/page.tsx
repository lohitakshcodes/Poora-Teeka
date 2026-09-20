'use client';

import React, { useState } from 'react';
import { LanguageChip, type SupportedLanguage } from '@/components/LanguageChip';

const translations = {
  en: {
    greeting: 'Hi Ramesh 👋',
    nextDosePrompt: 'Your next rabies vaccine dose is on',
    dateStr: 'September 22',
    progress: 'Dose 2 of 4 complete',
    centreName: 'Civil Hospital Rabies Clinic #1, Pune',
    directions: 'Get directions →',
    reassurance: 'The vaccine will be ready for you.',
    help: 'Need help or missed your date? Call the clinic helpline: 1800-209-4357',
  },
  hi: {
    greeting: 'नमस्ते रमेश 👋',
    nextDosePrompt: 'आपकी अगली रेबीज वैक्सीन की खुराक है',
    dateStr: '२२ सितंबर',
    progress: '४ में से २ खुराक पूरी हुईं',
    centreName: 'सिविल अस्पताल रेबीज क्लीनिक #१, पुणे',
    directions: 'रास्ता देखें →',
    reassurance: 'वैक्सीन आपके लिए तैयार रखी जाएगी।',
    help: 'मदद चाहिए या तारीख छूट गई? क्लीनिक हेल्पलाइन पर कॉल करें: 1800-209-4357',
  },
  mr: {
    greeting: 'नमस्कार रमेश 👋',
    nextDosePrompt: 'तुमचा पुढील रेबीज लस डोस या दिवशी आहे',
    dateStr: '२२ सप्टेंबर',
    progress: '४ पैकी २ डोस पूर्ण झाले',
    centreName: 'सिव्हिल हॉस्पिटल रेबीज क्लिनिक #१, पुणे',
    directions: 'मार्ग पहा →',
    reassurance: 'लस तुमच्यासाठी तयार ठेवली जाईल.',
    help: 'मदत हवी आहे किंवा तारीख चुकली? क्लिनिक हेल्पलाइनवर कॉल करा: 1800-209-4357',
  },
};

export default function PatientStatusPage() {
  const [lang, setLang] = useState<SupportedLanguage>('en');
  const t = translations[lang];

  return (
    <main className="min-h-screen bg-surfaceSunken flex flex-col justify-between p-6 sm:p-10 max-w-lg mx-auto text-ink font-sans">
      {/* Top Bar: Language Switcher */}
      <div className="flex items-center justify-between pb-6 border-b border-border/70">
        <span className="text-xs font-bold text-brand uppercase tracking-wider font-mono">
          Poora Teeka
        </span>
        <LanguageChip activeLang={lang} onChangeLang={setLang} />
      </div>

      {/* Main Warm Patient Card */}
      <div className="my-auto py-8 space-y-6">
        {/* 1. Patient's first name only, large, friendly */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black text-ink tracking-tight">
            {t.greeting}
          </h1>
          {/* 2. One clear, calm sentence */}
          <p className="text-lg sm:text-xl text-ink-muted leading-snug">
            {t.nextDosePrompt}{' '}
            <strong className="text-brand font-bold">{t.dateStr}</strong>.
          </p>
        </div>

        {/* 3. Simple visual of progress — 4 dots */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="text-ink">{t.progress}</span>
            <span className="text-xs font-mono text-brand font-bold">50%</span>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-3 flex-1 rounded-full transition-colors ${
                  step <= 2 ? 'bg-brand' : 'bg-surfaceSunken border border-border'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 4. Centre Name and Directions */}
        <div className="p-4 rounded-xl bg-surface border border-border space-y-2 text-sm">
          <div className="flex items-start gap-2.5">
            <svg className="w-5 h-5 text-brand shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <div>
              <p className="font-semibold text-ink">{t.centreName}</p>
              <a
                href="https://maps.google.com/?q=Civil+Hospital+Pune"
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

      {/* Footer / Helpline */}
      <footer className="pt-6 border-t border-border/70 text-center text-xs text-ink-muted">
        <p>{t.help}</p>
      </footer>
    </main>
  );
}
