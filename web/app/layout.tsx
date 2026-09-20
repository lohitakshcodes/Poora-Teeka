import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Poora Teeka — Rabies Vaccine Completion & Vial Batching',
  description: 'A dose-completion and vial-batching clinical system for anti-rabies clinics in India.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-surface-sunken text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
