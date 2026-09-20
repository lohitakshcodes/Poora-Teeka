import React from 'react';
import type { PlanSlot } from '@/lib/types';

interface PlanSlotGroupProps {
  slot: PlanSlot;
  slotIndex?: number;
  vialLabel?: string;
  className?: string;
}

export function PlanSlotGroup({
  slot,
  slotIndex = 0,
  vialLabel,
  className = '',
}: PlanSlotGroupProps) {
  const formattedTime = new Date(slot.slotStart).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const assignedVial = vialLabel || `Vial #${slotIndex + 1}`;

  return (
    <div className={`bg-surface border border-border rounded-xl p-4 md:p-5 shadow-sm space-y-3 ${className}`}>
      {/* Slot Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-base font-bold text-ink">{formattedTime}</span>
          <span className="text-xs bg-brandSoft text-brand px-2 py-0.5 rounded-md font-semibold">
            {slot.patients.length} patients batched
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-ink-muted bg-surfaceSunken px-2.5 py-1 rounded border border-border">
          <span className="w-2 h-2 rounded-full bg-brand" aria-hidden="true" />
          <span>{assignedVial}</span>
        </div>
      </div>

      {/* Batched Patients List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
        {slot.patients.map((patient) => (
          <div
            key={patient.id}
            className="flex items-center justify-between p-2.5 rounded-lg bg-surfaceSunken border border-border/70 text-xs"
          >
            <div>
              <span className="font-semibold text-ink block">{patient.name}</span>
              <span className="text-ink-muted font-mono text-[11px]">{patient.id}</span>
            </div>
            <span className="px-2 py-0.5 rounded font-mono font-semibold bg-white border border-border text-brand">
              Dose {patient.seq}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
