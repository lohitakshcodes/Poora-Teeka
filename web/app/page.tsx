import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-surfaceSunken flex flex-col justify-between p-6 sm:p-12 md:p-16 max-w-5xl mx-auto selection:bg-brandSoft selection:text-brand">
      {/* Top Header / Brand */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-brand text-white font-bold flex items-center justify-center text-sm shadow-xs">
            PT
          </span>
          <div>
            <span className="font-bold text-xl text-ink tracking-tight block leading-none">
              Poora Teeka
            </span>
            <span className="text-xs text-ink-muted font-medium">
              पूरा टीका • Anti-Rabies Vaccine Completion
            </span>
          </div>
        </div>

        <Link
          href="/app"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-emerald-800 transition-colors shadow-xs"
        >
          <span>Open Clinic App</span>
          <span aria-hidden="true">→</span>
        </Link>
      </header>

      {/* Main Hero & Problem Statement */}
      <section className="py-16 sm:py-24 space-y-10">
        <div className="space-y-6 max-w-3xl">
          {/* 1. Huge stat alone on the screen */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-ink tracking-tight leading-[1.15]">
            Nearly half the people who start rabies vaccination in India{' '}
            <span className="text-brand underline decoration-brand/30 underline-offset-8">
              never finish it.
            </span>
          </h1>

          {/* 2. The second half of the problem */}
          <p className="text-xl sm:text-2xl text-ink-muted font-normal leading-relaxed">
            And clinics throw away vaccine they&apos;ve already opened.
          </p>
        </div>

        {/* 3. Small, quiet illustrative visual: 8-hour cold chain vial constraint (Motion Budget #5) */}
        <div className="p-6 rounded-2xl bg-surface border border-border max-w-md shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-brand animate-ping opacity-75" />
              <span className="text-sm font-bold text-ink">The 8-Hour Constraint</span>
            </div>
            <span className="text-xs font-mono bg-urgentBg text-urgent px-2 py-0.5 rounded font-bold border border-urgent/20">
              Must discard after 8h
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-ink-muted font-medium">
              <span>Opened 09:00 AM</span>
              <span className="text-urgent font-mono font-semibold">Expires 05:00 PM</span>
            </div>
            <div className="w-full bg-surfaceSunken h-2.5 rounded-full overflow-hidden border border-border">
              <div className="bg-gradient-to-r from-brand to-urgent h-full w-3/4 rounded-full" />
            </div>
          </div>

          <p className="text-xs text-ink-muted leading-relaxed">
            Poora Teeka automatically groups intradermal doses into synchronized appointment batches and dispatches localized WhatsApp and voice reminders so patients finish every shot and no vial is wasted.
          </p>
        </div>

        {/* 4. Call to action */}
        <div className="pt-2">
          <Link
            href="/app"
            className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-brand text-white text-base font-bold hover:bg-emerald-800 transition-all shadow-sm active:scale-[0.99]"
          >
            <span>Open the clinic dashboard</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* 5. One-line footer */}
      <footer className="pt-8 border-t border-border/80 flex flex-col sm:flex-row items-center justify-between text-xs text-ink-muted gap-2">
        <p>Built for AWS First Commit, September 2026</p>
        <p className="font-mono text-[11px]">Region: ap-south-1 (Mumbai) • PostgreSQL 16</p>
      </footer>
    </main>
  );
}
