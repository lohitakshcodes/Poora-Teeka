import React from 'react';
import { ClinicNav } from './ClinicNav';
import { CentreProvider } from '@/lib/centreContext';

export default function ClinicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CentreProvider>
      <div className="min-h-screen bg-surfaceSunken flex flex-col">
        <ClinicNav />
        {/* Main Content Area: Offset by sidebar width on desktop */}
        <div className="md:pl-64 flex-1 flex flex-col min-h-screen">
          <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-6xl w-full mx-auto pb-24 md:pb-8">
            {children}
          </main>
        </div>
      </div>
    </CentreProvider>
  );
}

