/**
 * Load Testing Tool Selection: Custom TypeScript Concurrency Harness (api/spikes/load-test.ts)
 * 
 * Why not generic Autocannon / k6?
 * 1. Stateful & Optimistic Concurrency: Every POST /doses/{id}/given call must target a UNIQUE
 *    dose UUID, supply the dose's current optimistic locking `version`, and include a distinct
 *    `Idempotency-Key` header. Generic benchmarking tools replay requests against static URLs
 *    and cannot correlate 20 pre-seeded, distinct dose IDs with their optimistic versions.
 * 2. Deep Invariant Verification: Immediately after the 20 parallel requests resolve, this harness
 *    queries PostgreSQL directly to verify that exactly 5 doses were allocated to the primary vial
 *    before rolling over, and executes the schema's invariant view (v_invariant_violations) to
 *    mathematically prove 0 violations.
 */

import { query, withTransaction, pool } from '../src/db';

const API_URL =
  process.env.API_URL ||
  'https://o025clnwai.execute-api.ap-south-1.amazonaws.com';

const CENTRE_ID = 'a0000000-0000-0000-0000-000000000001';

interface TestDose {
  doseId: string;
  courseId: string;
  patientName: string;
  version: number;
}

interface RequestResult {
  doseId: string;
  patientName: string;
  status: number;
  durationMs: number;
  vialId?: string;
  vialSerial?: string;
  units?: number;
  error?: string;
}

async function runLoadTest() {
  console.log('================================================================');
  console.log('  Poora Teeka - Vial Reservation Concurrency Load Test          ');
  console.log('================================================================');
  console.log(`API URL:        ${API_URL}`);
  console.log(`Target Centre:  ${CENTRE_ID}`);
  console.log(`Concurrency:    20 simultaneous POST /doses/{id}/given calls`);
  console.log(`Vial Capacity:  Exactly 5 doses (10 units total, 2 units/dose)`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  try {
    // -------------------------------------------------------------------------
    // Step 1: Provision fresh test vial lot & open exactly ONE primary vial
    // -------------------------------------------------------------------------
    console.log('🔍 Step 1: Provisioning test inventory & opening Primary Vial (capacity: exactly 5 doses)...');
    
    // Create dedicated lot with ample stock for rollover
    const lotRes = await query(
      `INSERT INTO vial_lots (centre_id, vaccine_id, brand, ml, units_per_vial, expiry, received, remaining_unopened)
       VALUES ($1, 'RABIES', 'Rabivax-S Concurrency Lot', 1.00, 10, '2028-12-31', 20, 20)
       RETURNING id, brand, units_per_vial`,
      [CENTRE_ID]
    );
    const testLot = lotRes.rows[0];
    const testLotId = testLot.id;

    // Open exactly ONE vial sized for 10 units (= 5 ID doses at 2 units each)
    const primarySerial = `LOADTEST-PRIMARY-${Date.now().toString(36).toUpperCase()}`;
    const openRes = await query(
      `INSERT INTO open_vials (centre_id, lot_id, vial_serial, opened_at, usable, units_total, units_used)
       VALUES (
         $1, $2, $3,
         now(),
         tstzrange(now(), now() + interval '6 hours'),
         10,
         0
       )
       RETURNING id, vial_serial, units_total, units_used`,
      [CENTRE_ID, testLotId, primarySerial]
    );
    const primaryVial = openRes.rows[0];
    const primaryVialId = primaryVial.id;

    console.log(`✅ Primary Vial Opened:`);
    console.log(`   - Vial ID:     ${primaryVialId}`);
    console.log(`   - Serial:      ${primaryVial.vial_serial}`);
    console.log(`   - Capacity:    ${primaryVial.units_total} units (Exactly 5 doses of 2 units)`);
    console.log(`   - Units Used:  ${primaryVial.units_used}`);

    // -------------------------------------------------------------------------
    // Step 2: Seed 20 synthetic patients with active DUE doses
    // -------------------------------------------------------------------------
    console.log('\n🔍 Step 2: Seeding 20 distinct synthetic patients and DUE doses...');
    const testDoses: TestDose[] = [];

    for (let i = 1; i <= 20; i++) {
      const pad = String(i).padStart(2, '0');
      const name = `LoadTest Patient-${pad}`;
      const phone = `+9199999000${pad}`;

      const pRes = await query(
        `INSERT INTO patients (centre_id, name, phone_e164, language)
         VALUES ($1, $2, $3, 'hi')
         RETURNING id`,
        [CENTRE_ID, name, phone]
      );
      const patientId = pRes.rows[0].id;

      const cRes = await query(
        `INSERT INTO courses (patient_id, centre_id, protocol_id, route, day0, status)
         VALUES ($1, $2, 'thai_red_cross_id', 'ID', CURRENT_DATE, 'ACTIVE')
         RETURNING id`,
        [patientId, CENTRE_ID]
      );
      const courseId = cRes.rows[0].id;

      const dRes = await query(
        `INSERT INTO doses (course_id, route, seq, due_date, status, version)
         VALUES ($1, 'ID', 1, CURRENT_DATE, 'DUE', 1)
         RETURNING id, version`,
        [courseId]
      );
      testDoses.push({
        doseId: dRes.rows[0].id,
        courseId,
        patientName: name,
        version: dRes.rows[0].version,
      });
    }

    console.log(`✅ Successfully seeded 20 test doses (all status 'DUE', route 'ID', version 1).`);

    // -------------------------------------------------------------------------
    // Step 2.5: Warm up Lambda function
    // -------------------------------------------------------------------------
    console.log('\n🔥 Step 2.5: Warming up Lambda container...');
    try {
      await fetch(`${API_URL}/hello`);
      console.log('✅ Lambda warm-up request succeeded.');
    } catch {
      // Ignore warm-up error
    }

    // -------------------------------------------------------------------------
    // Step 3: Fire 20 concurrent POST /doses/{id}/given requests
    // -------------------------------------------------------------------------
    console.log('\n⚡ Step 3: Firing 20 concurrent POST /doses/{id}/given requests simultaneously...');
    console.log('   Target: AWS API Gateway -> DoseGivenHandler Lambda -> Postgres reserve_units()');
    console.log('   Note: AWS Account concurrency is limited to 10; retry queue will absorb throttling seamlessly.');
    
    const startTime = Date.now();

    const dispatchPromise = testDoses.map(async (dose, idx): Promise<RequestResult> => {
      const callStart = Date.now();
      const idempotencyKey = `concurrency-test-${dose.doseId}-${Date.now()}`;

      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const res = await fetch(`${API_URL}/doses/${dose.doseId}/given`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({ version: dose.version }),
          });

          const text = await res.text();

          // If throttled by AWS Lambda 10-concurrency account limit (503/429), back off and retry
          if ((res.status === 503 || res.status === 429) && attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
            continue;
          }

          const durationMs = Date.now() - callStart;

          if (!res.ok) {
            return {
              doseId: dose.doseId,
              patientName: dose.patientName,
              status: res.status,
              durationMs,
              error: text,
            };
          }

          const data = JSON.parse(text);
          return {
            doseId: dose.doseId,
            patientName: dose.patientName,
            status: res.status,
            durationMs,
            vialId: data.reservation?.open_vial_id,
            vialSerial: data.reservation?.vial_serial,
            units: data.reservation?.units,
          };
        } catch (err: any) {
          if (attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 400 * attempts));
            continue;
          }
          return {
            doseId: dose.doseId,
            patientName: dose.patientName,
            status: 500,
            durationMs: Date.now() - callStart,
            error: err.message || String(err),
          };
        }
      }

      return {
        doseId: dose.doseId,
        patientName: dose.patientName,
        status: 500,
        durationMs: Date.now() - callStart,
        error: 'Max retry attempts exceeded',
      };
    });

    const results = await Promise.all(dispatchPromise);
    const totalDuration = Date.now() - startTime;

    console.log(`\n✅ All 20 concurrent requests completed in ${totalDuration} ms!`);

    // -------------------------------------------------------------------------
    // Step 4: Analyze reservation allocation across vials
    // -------------------------------------------------------------------------
    console.log('\n🔍 Step 4: Analyzing Vial Allocation Results:');
    console.log('----------------------------------------------------------------');
    
    const successful = results.filter((r) => r.status === 200);
    const failed = results.filter((r) => r.status !== 200);

    console.log(`Total Requests:    20`);
    console.log(`Successful (200):  ${successful.length}`);
    console.log(`Failed (Non-200):  ${failed.length}`);

    if (failed.length > 0) {
      console.error('❌ Failed requests:', failed);
      throw new Error(`Expected all 20 requests to succeed, but ${failed.length} failed.`);
    }

    // Group results by vialId
    const vialGroups: Record<string, { serial: string; count: number; doses: string[] }> = {};
    for (const r of successful) {
      const vid = r.vialId || 'unknown';
      if (!vialGroups[vid]) {
        vialGroups[vid] = { serial: r.vialSerial || 'unknown', count: 0, doses: [] };
      }
      vialGroups[vid].count++;
      vialGroups[vid].doses.push(r.doseId);
    }

    console.log('\nAllocation Breakdown by Vial:');
    for (const [vid, group] of Object.entries(vialGroups)) {
      const isPrimary = vid === primaryVialId;
      console.log(
        `   • Vial ${group.serial} (${vid.slice(0, 8)}...): ${group.count} doses (${group.count * 2} units) ${
          isPrimary ? '⬅️ PRIMARY VIAL (Sized for 5)' : '⬅️ Rollover Vial'
        }`
      );
    }

    const primaryAllocatedCount = vialGroups[primaryVialId]?.count || 0;
    console.log(`\nPrimary Vial Success Count: ${primaryAllocatedCount} of 5 capacity`);

    if (primaryAllocatedCount !== 5) {
      throw new Error(
        `Invariant failure: Primary vial was expected to receive exactly 5 doses, but received ${primaryAllocatedCount}.`
      );
    }

    // -------------------------------------------------------------------------
    // Step 5: Query PostgreSQL Schema Invariant View
    // -------------------------------------------------------------------------
    console.log('\n🔍 Step 5: Executing PostgreSQL Schema Invariant Query...');
    console.log('----------------------------------------------------------------');
    console.log('SQL: SELECT * FROM v_invariant_violations;');
    console.log('----------------------------------------------------------------');

    const invRes = await query('SELECT * FROM v_invariant_violations');
    
    if (invRes.rows.length === 0) {
      console.log('🎉 INVARIANT CHECK PASSED: ZERO VIOLATIONS DETECTED (0 rows returned)!');
      console.log('   - No vial was overspent (units_used <= units_total for every vial).');
      console.log('   - units_used exactly equals the sum of dose_reservations units.');
    } else {
      console.error('❌ CRITICAL: Schema Invariant Violations Detected:', invRes.rows);
      throw new Error('v_invariant_violations returned rows!');
    }

    // Inspect primary vial in database
    const checkPrimaryRes = await query(
      `SELECT ov.id, ov.vial_serial, ov.units_total, ov.units_used,
              COUNT(dr.id)::int AS reservation_count,
              SUM(dr.units)::int AS total_units_reserved
         FROM open_vials ov
         JOIN dose_reservations dr ON dr.open_vial_id = ov.id
        WHERE ov.id = $1
        GROUP BY ov.id, ov.vial_serial, ov.units_total, ov.units_used`,
      [primaryVialId]
    );

    console.log('\nPrimary Vial Final Ledger State:');
    console.table(checkPrimaryRes.rows);

    console.log('\n================================================================');
    console.log('  Concurrency Load Test Summary                                 ');
    console.log('================================================================');
    console.log('  1. 20 Concurrent Calls:       ✅ 20 / 20 SUCCESS (HTTP 200)');
    console.log('  2. Primary Vial Allocation:   ✅ EXACTLY 5 DOSES (10 / 10 units)');
    console.log('  3. Automatic Vial Rollover:   ✅ 15 DOSES rolled over cleanly');
    console.log('  4. Schema Invariant View:     ✅ 0 VIOLATIONS (Mathematically sound)');
    console.log('================================================================');
  } catch (err: any) {
    console.error('\n❌ Load Test Failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runLoadTest();
