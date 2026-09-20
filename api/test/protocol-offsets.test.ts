import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Helper to compute due_date = day0 + offset days
 * (Matches PostgreSQL date addition: ($4::date + ($5 || ' days')::interval)::date)
 */
export function computeDueDate(day0Iso: string, offsetDays: number): string {
  const [year, month, day] = day0Iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().split('T')[0];
}

export const PROTOCOL_SPECS = {
  RABIES_ID: {
    id: 'IN-UTRC-ID-v1',
    label: 'Updated Thai Red Cross (2-site ID)',
    vaccineId: 'RABIES',
    route: 'ID',
    visitOffsets: [0, 3, 7, 28],
    unitsPerVisit: 2,
  },
  RABIES_IM: {
    id: 'IN-ESSEN-IM-v1',
    label: 'Essen Regimen (1-site IM)',
    vaccineId: 'RABIES',
    route: 'IM',
    visitOffsets: [0, 3, 7, 14, 28],
    unitsPerVisit: 1,
  },
  BCG: {
    id: 'IN-BCG-v1',
    label: 'BCG — single dose (newborn)',
    vaccineId: 'BCG',
    route: 'ID',
    visitOffsets: [0],
    unitsPerVisit: 1,
  },
  HEPB: {
    id: 'IN-HEPB-IM-v1',
    label: 'Hepatitis B — 3 doses',
    vaccineId: 'HEPB',
    route: 'IM',
    visitOffsets: [0, 30, 180],
    unitsPerVisit: 1,
  },
} as const;

describe('1. Protocol Date-Offset Math', () => {
  const day0 = '2026-09-20';

  it('calculates correct due dates for Rabies ID (Updated Thai Red Cross: 0, 3, 7, 28)', () => {
    const offsets = PROTOCOL_SPECS.RABIES_ID.visitOffsets;
    assert.deepEqual(offsets, [0, 3, 7, 28]);

    const dueDates = offsets.map((offset) => computeDueDate(day0, offset));
    assert.deepEqual(dueDates, [
      '2026-09-20', // Day 0
      '2026-09-23', // Day 3
      '2026-09-27', // Day 7
      '2026-10-18', // Day 28 (month boundary crossing)
    ]);
  });

  it('calculates correct due dates for Rabies IM (Essen Regimen: 0, 3, 7, 14, 28)', () => {
    const offsets = PROTOCOL_SPECS.RABIES_IM.visitOffsets;
    assert.deepEqual(offsets, [0, 3, 7, 14, 28]);

    const dueDates = offsets.map((offset) => computeDueDate(day0, offset));
    assert.deepEqual(dueDates, [
      '2026-09-20', // Day 0
      '2026-09-23', // Day 3
      '2026-09-27', // Day 7
      '2026-10-04', // Day 14
      '2026-10-18', // Day 28
    ]);
  });

  it('calculates correct due dates for BCG (Single offset: 0)', () => {
    const offsets = PROTOCOL_SPECS.BCG.visitOffsets;
    assert.deepEqual(offsets, [0]);

    const dueDates = offsets.map((offset) => computeDueDate(day0, offset));
    assert.deepEqual(dueDates, ['2026-09-20']);
  });

  it('calculates correct due dates for Hepatitis B (Three offsets: 0, 30, 180)', () => {
    const offsets = PROTOCOL_SPECS.HEPB.visitOffsets;
    assert.deepEqual(offsets, [0, 30, 180]);

    const dueDates = offsets.map((offset) => computeDueDate(day0, offset));
    assert.deepEqual(dueDates, [
      '2026-09-20', // Day 0
      '2026-10-20', // Day 30
      '2027-03-19', // Day 180 (year boundary crossing)
    ]);
  });
});
