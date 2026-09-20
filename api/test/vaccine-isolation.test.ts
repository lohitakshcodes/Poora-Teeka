import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface OpenVial {
  id: string;
  lotId: string;
  vaccineId: string;
  unitsTotal: number;
  unitsUsed: number;
  unitsRemaining: number;
  expiresAt: Date;
}

interface DoseContext {
  doseId: string;
  protocolId: string;
  vaccineId: string;
  route: 'ID' | 'IM';
  unitsNeeded: number;
}

/**
 * Pure unit implementation of the reserve_units candidate selection logic
 * mirroring PostgreSQL reserve_units(p_dose, p_centre, p_units):
 *
 * 1. Derives required vaccine_id from dose -> course -> protocol
 * 2. Filters open vials by vl.vaccine_id = v_vaccine_id
 * 3. Filters by (units_total - units_used) >= p_units AND expires_at > now()
 * 4. Orders by expires_at ASC
 */
export function selectCandidateVial(
  dose: DoseContext,
  availableVials: OpenVial[],
  now: Date = new Date()
): OpenVial | null {
  // Derive vaccine_id from dose context (strictly required)
  const targetVaccineId = dose.vaccineId;

  // Filter candidates matching vaccine_id, sufficient capacity, and unexpired
  const eligible = availableVials.filter((vial) => {
    const isSameVaccine = vial.vaccineId === targetVaccineId;
    const hasCapacity = vial.unitsRemaining >= dose.unitsNeeded;
    const isUnexpired = vial.expiresAt.getTime() > now.getTime();
    return isSameVaccine && hasCapacity && isUnexpired;
  });

  if (eligible.length === 0) {
    return null;
  }

  // Expiry-first ordering (earliest expiry first)
  eligible.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  return eligible[0];
}

describe('2. Multi-Vaccine Vial Isolation (Unit-Level)', () => {
  const now = new Date('2026-09-20T10:00:00Z');
  const futureExpiry = new Date('2026-09-20T16:00:00Z');

  const rabiesVial: OpenVial = {
    id: 'vial-rabies-001',
    lotId: 'lot-rabivax-s',
    vaccineId: 'RABIES',
    unitsTotal: 10,
    unitsUsed: 2,
    unitsRemaining: 8,
    expiresAt: futureExpiry,
  };

  const bcgVial: OpenVial = {
    id: 'vial-bcg-001',
    lotId: 'lot-bcg-serum-inst',
    vaccineId: 'BCG',
    unitsTotal: 10,
    unitsUsed: 1,
    unitsRemaining: 9,
    expiresAt: futureExpiry,
  };

  const hepbVial: OpenVial = {
    id: 'vial-hepb-001',
    lotId: 'lot-genevac-b',
    vaccineId: 'HEPB',
    unitsTotal: 10,
    unitsUsed: 0,
    unitsRemaining: 10,
    expiresAt: futureExpiry,
  };

  const allOpenVials = [rabiesVial, bcgVial, hepbVial];

  it('selects ONLY Rabies vial for a Rabies ID dose (Updated Thai Red Cross)', () => {
    const rabiesIdDose: DoseContext = {
      doseId: 'dose-rabies-id-1',
      protocolId: 'IN-UTRC-ID-v1',
      vaccineId: 'RABIES',
      route: 'ID',
      unitsNeeded: 2,
    };

    const chosen = selectCandidateVial(rabiesIdDose, allOpenVials, now);
    assert.ok(chosen, 'A candidate vial should be found');
    assert.equal(chosen.id, rabiesVial.id);
    assert.equal(chosen.vaccineId, 'RABIES');
  });

  it('allows Rabies IM dose (Essen Regimen) to share the same physical Rabies vial stock', () => {
    const rabiesImDose: DoseContext = {
      doseId: 'dose-rabies-im-1',
      protocolId: 'IN-ESSEN-IM-v1',
      vaccineId: 'RABIES',
      route: 'IM',
      unitsNeeded: 1,
    };

    const chosen = selectCandidateVial(rabiesImDose, allOpenVials, now);
    assert.ok(chosen, 'Rabies IM should draw from open Rabies vial');
    assert.equal(chosen.id, rabiesVial.id);
    assert.equal(chosen.vaccineId, 'RABIES');
  });

  it('selects ONLY BCG vial for a BCG dose, strictly isolating from Rabies stock', () => {
    const bcgDose: DoseContext = {
      doseId: 'dose-bcg-1',
      protocolId: 'IN-BCG-v1',
      vaccineId: 'BCG',
      route: 'ID',
      unitsNeeded: 1,
    };

    const chosen = selectCandidateVial(bcgDose, allOpenVials, now);
    assert.ok(chosen, 'A BCG vial should be found');
    assert.equal(chosen.id, bcgVial.id);
    assert.equal(chosen.vaccineId, 'BCG');
    assert.notEqual(chosen.id, rabiesVial.id);
  });

  it('never draws from another vaccine vial when own vaccine stock is exhausted', () => {
    // Depleted BCG vial
    const depletedBcgVial: OpenVial = {
      ...bcgVial,
      unitsUsed: 10,
      unitsRemaining: 0,
    };

    const bcgDose: DoseContext = {
      doseId: 'dose-bcg-2',
      protocolId: 'IN-BCG-v1',
      vaccineId: 'BCG',
      route: 'ID',
      unitsNeeded: 1,
    };

    // Even though Rabies vial has 8 units available, BCG must return null (require new vial opening)
    const chosen = selectCandidateVial(bcgDose, [rabiesVial, depletedBcgVial], now);
    assert.equal(chosen, null, 'BCG must NOT steal capacity from an open Rabies vial');
  });
});
