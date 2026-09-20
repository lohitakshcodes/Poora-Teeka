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
      <section className="py-10 sm:py-16">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
          {/* Left Column: Headline, subtext, banner, and CTA */}
          <div className="space-y-8 flex-1 max-w-2xl">
            <div className="space-y-5">
              {/* 1. Huge stat alone on the screen in serif font */}
              <h1
                style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif' }}
                className="text-3xl sm:text-5xl md:text-6xl font-normal text-ink tracking-tight leading-[1.2]"
              >
                Nearly half the people who start rabies vaccination in India{' '}
                <span className="text-brand underline decoration-brand/30 underline-offset-8">
                  never finish it.
                </span>
              </h1>

              {/* 2. The second half of the problem */}
              <p className="text-xl sm:text-2xl text-ink-muted font-normal leading-relaxed">
                And clinics throw away the vaccine they opened.
              </p>
            </div>

            {/* 3. Paper Card / Banner SVG from docs */}
            <div className="max-w-xl">
              <img
                src="/banner.svg"
                alt="Poora Teeka Vaccine Completion & Batching System"
                className="w-full rounded-2xl border border-border/80 shadow-sm bg-white"
              />
            </div>

            {/* 4. Call to action */}
            <div className="pt-2">
              <Link
                href="/app"
                className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-brand text-white text-base font-bold hover:bg-emerald-800 transition-all shadow-sm active:scale-[0.99]"
              >
                <span>Open clinic dashboard →</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Addition A - Compact Asymmetric Photo Mosaic (hidden md:grid, ~280px wide) */}
          <div className="hidden md:grid grid-cols-3 gap-2.5 w-[280px] shrink-0 pt-2" aria-hidden="true">
            {/* Column 1 */}
            <div className="space-y-2.5">
              <img
                src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=300&q=80"
                alt=""
                className="w-full h-32 object-cover rounded-2xl shadow-xs border border-border/60"
                loading="lazy"
              />
              <img
                src="https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=300&q=80"
                alt=""
                className="w-full h-44 object-cover rounded-2xl shadow-xs border border-border/60"
                loading="lazy"
              />
            </div>

            {/* Column 2 */}
            <div className="space-y-2.5 pt-4">
              <img
                src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=300&q=80"
                alt=""
                className="w-full h-44 object-cover rounded-2xl shadow-xs border border-border/60"
                loading="lazy"
              />
              <img
                src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=300&q=80"
                alt=""
                className="w-full h-28 object-cover rounded-2xl shadow-xs border border-border/60"
                loading="lazy"
              />
            </div>

            {/* Column 3 */}
            <div className="space-y-2.5 pt-1">
              <img
                src="https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=300&q=80"
                alt=""
                className="w-full h-28 object-cover rounded-2xl shadow-xs border border-border/60"
                loading="lazy"
              />
              <img
                src="https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=300&q=80"
                alt=""
                className="w-full h-36 object-cover rounded-2xl shadow-xs border border-border/60"
                loading="lazy"
              />
              <img
                src="https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=300&q=80"
                alt=""
                className="w-full h-24 object-cover rounded-2xl shadow-xs border border-border/60"
                loading="lazy"
              />
            </div>
          </div>
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
