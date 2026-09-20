import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export interface BatchingCalculationInput {
  totalPatients: number;
  vialCapacityUnits?: number; // default: 10
  unitsPerVisit?: number; // default: 2 (Thai Red Cross ID)
  walkInReserveRatio?: number; // default: 0.2 (20%)
}

export interface BatchingCalculationResult {
  totalScheduledPatients: number;
  vialCapacityUnits: number;
  unitsPerVisit: number;
  walkInReservedUnits: number;
  walkInReservedSlots: number;
  maxPlannedPatientsPerVial: number;
  vialsNeededBatched: number;
  vialsNeededNaive: number;
  vialsSaved: number;
  savingsPercentage: number;
}

/**
 * Pure arithmetic implementation matching api/src/handlers/plan.ts lines 220-282
 */
export function calculateBatchingMetrics(
  input: BatchingCalculationInput
): BatchingCalculationResult {
  const totalPatients = Math.max(0, input.totalPatients);
  const vialCapacityUnits = input.vialCapacityUnits ?? 10;
  const unitsPerVisit = input.unitsPerVisit ?? 2;
  const walkInReserveRatio = input.walkInReserveRatio ?? 0.2;

  // 20% capacity reserved for unplanned emergency walk-ins
  const walkInReservedUnits = Math.round(vialCapacityUnits * walkInReserveRatio);
  const walkInReservedSlots = Math.floor(walkInReservedUnits / unitsPerVisit);

  // Usable capacity for pre-scheduled patients
  const plannedUnitsPerVial = vialCapacityUnits - walkInReservedUnits;
  const maxPlannedPatientsPerVial = Math.max(
    1,
    Math.floor(plannedUnitsPerVial / unitsPerVisit)
  );

  const vialsNeededBatched =
    totalPatients === 0
      ? 0
      : Math.ceil(totalPatients / maxPlannedPatientsPerVial);
  const vialsNeededNaive = totalPatients;
  const vialsSaved = Math.max(0, vialsNeededNaive - vialsNeededBatched);
  const savingsPercentage =
    totalPatients > 0
      ? Math.round((vialsSaved / vialsNeededNaive) * 100)
      : 0;

  return {
    totalScheduledPatients: totalPatients,
    vialCapacityUnits,
    unitsPerVisit,
    walkInReservedUnits,
    walkInReservedSlots,
    maxPlannedPatientsPerVial,
    vialsNeededBatched,
    vialsNeededNaive,
    vialsSaved,
    savingsPercentage,
  };
}

describe('4. Naive vs Planned Vial Count Calculation (/plan/tomorrow)', () => {
  it('correctly calculates 70% vial savings for 10 scheduled ID patients (known input)', () => {
    // 10 patients, 10-unit vial, 2 units/patient, 20% reserve (2 units)
    // -> 8 usable units -> 4 patients/vial -> ceil(10/4) = 3 batched vials
    // -> Naive = 10 vials -> Saved = 7 vials -> 70% savings
    const result = calculateBatchingMetrics({
      totalPatients: 10,
      vialCapacityUnits: 10,
      unitsPerVisit: 2,
    });

    assert.equal(result.totalScheduledPatients, 10);
    assert.equal(result.walkInReservedUnits, 2);
    assert.equal(result.walkInReservedSlots, 1);
    assert.equal(result.maxPlannedPatientsPerVial, 4);
    assert.equal(result.vialsNeededBatched, 3);
    assert.equal(result.vialsNeededNaive, 10);
    assert.equal(result.vialsSaved, 7);
    assert.equal(result.savingsPercentage, 70);
  });

  it('correctly calculates 75% vial savings for 12 scheduled ID patients (exact multiple of batch size)', () => {
    // 12 patients -> ceil(12/4) = 3 batched vials vs 12 naive vials -> 9 vials saved (75%)
    const result = calculateBatchingMetrics({
      totalPatients: 12,
      vialCapacityUnits: 10,
      unitsPerVisit: 2,
    });

    assert.equal(result.vialsNeededBatched, 3);
    assert.equal(result.vialsNeededNaive, 12);
    assert.equal(result.vialsSaved, 9);
    assert.equal(result.savingsPercentage, 75);
  });

  it('handles small patient volumes where batching equals naive baseline (1 patient)', () => {
    const result = calculateBatchingMetrics({
      totalPatients: 1,
      vialCapacityUnits: 10,
      unitsPerVisit: 2,
    });

    assert.equal(result.vialsNeededBatched, 1);
    assert.equal(result.vialsNeededNaive, 1);
    assert.equal(result.vialsSaved, 0);
    assert.equal(result.savingsPercentage, 0);
  });

  it('handles zero scheduled patients gracefully', () => {
    const result = calculateBatchingMetrics({
      totalPatients: 0,
      vialCapacityUnits: 10,
      unitsPerVisit: 2,
    });

    assert.equal(result.vialsNeededBatched, 0);
    assert.equal(result.vialsNeededNaive, 0);
    assert.equal(result.vialsSaved, 0);
    assert.equal(result.savingsPercentage, 0);
  });
});
