'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: (active: boolean) => React.ReactNode;
}

const navItems: NavItem[] = [
  {
    name: 'Today',
    href: '/app',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-white' : 'text-ink-muted'}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    name: 'Register',
    href: '/app/register',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-white' : 'text-ink-muted'}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.765z" />
      </svg>
    ),
  },
  {
    name: 'Vials',
    href: '/app/vials',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-white' : 'text-ink-muted'}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.942a2.25 2.25 0 01-1.157.324H6.927c-.42 0-.825-.118-1.157-.324L4.2 15.3m15.6 0v3.45a2.25 2.25 0 01-2.25 2.25H6.45A2.25 2.25 0 014.2 18.75V15.3" />
      </svg>
    ),
  },
  {
    name: 'Plan',
    href: '/app/plan',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-white' : 'text-ink-muted'}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    name: 'Missed',
    href: '/app/missed',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-white' : 'text-ink-muted'}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 8.25h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    name: 'Dashboard',
    href: '/app/dashboard',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-white' : 'text-ink-muted'}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

export function ClinicNav() {
  const pathname = usePathname();

  const isRouteActive = (href: string) => {
    if (href === '/app') {
      return pathname === '/app';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop Sidebar (>= 768px) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-surface border-r border-border z-30">
        {/* Brand & Clinic Indicator */}
        <div className="p-5 border-b border-border/70">
          <Link href="/" className="group block">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-brand text-white font-bold flex items-center justify-center text-sm shadow-xs group-hover:bg-emerald-800 transition-colors">
                PT
              </span>
              <div>
                <h1 className="font-bold text-lg text-ink tracking-tight leading-none">
                  Poora Teeka
                </h1>
                <span className="text-[11px] text-ink-muted font-medium">
                  पूरा टीका • Anti-Rabies
                </span>
              </div>
            </div>
          </Link>

          {/* Centre Awareness Indicator */}
          <div className="mt-4 p-2.5 rounded-lg bg-surfaceSunken border border-border/80 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-statusGiven shrink-0" aria-hidden="true" />
            <div className="truncate">
              <p className="text-xs font-semibold text-ink truncate leading-tight">
                Civil Hospital Clinic #1
              </p>
              <p className="text-[10px] text-ink-muted font-mono truncate">
                Centre Pune • ap-south-1
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto" aria-label="Staff navigation">
          {navItems.map((item) => {
            const active = isRouteActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? 'bg-brand text-white shadow-xs font-bold'
                    : 'text-ink-muted hover:text-ink hover:bg-surfaceSunken'
                }`}
              >
                {item.icon(active)}
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer / Exit Link */}
        <div className="p-4 border-t border-border/70 text-xs text-ink-muted">
          <div className="flex items-center justify-between">
            <Link href="/" className="hover:text-ink font-medium transition-colors">
              ← Exit to Landing
            </Link>
            <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
              v1.0
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile/Tablet Bottom Tab Bar (< 768px) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-border z-40 px-2 py-1.5 shadow-lg flex items-center justify-around"
        aria-label="Staff bottom navigation"
      >
        {navItems.map((item) => {
          const active = isRouteActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                active
                  ? 'bg-brand text-white px-2.5 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <div className="scale-90">{item.icon(active)}</div>
              <span className="mt-0.5 tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
