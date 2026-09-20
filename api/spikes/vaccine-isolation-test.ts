import fs from 'node:fs';
import path from 'node:path';
import { query, pool } from '../src/db';

// Resolve environment
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'api/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      }
      break;
    } catch {
      // Ignore
    }
  }
}

async function runVaccineIsolationTest() {
  console.log('================================================================');
  console.log('  Poora Teeka - Multi-Vaccine Vial Isolation Test (P1 Verification)');
  console.log('  Proving physical stock isolation between RABIES and BCG vials   ');
  console.log('================================================================');
  console.log(`DB Host:    ${process.env.DB_HOST}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  // 1. Resolve centre
  const centreRes = await query(`SELECT id, name, city FROM centres LIMIT 1`);
  if (centreRes.rows.length === 0) {
    throw new Error('No centre found in database. Run seed first.');
  }
  const centre = centreRes.rows[0];
  console.log(`🏥 Clinic Centre: ${centre.name} (${centre.city} - ${centre.id})`);

  // 2. Verify protocol configurations
  const rabiesProtoRes = await query(
    `SELECT id, label, vaccine_id, route, units_per_visit FROM protocols WHERE vaccine_id = 'RABIES' AND route = 'ID' LIMIT 1`
  );
  const bcgProtoRes = await query(
    `SELECT id, label, vaccine_id, route, units_per_visit FROM protocols WHERE vaccine_id = 'BCG' LIMIT 1`
  );

  if (rabiesProtoRes.rows.length === 0 || bcgProtoRes.rows.length === 0) {
    throw new Error('Required protocols not found. Run migration 003 first.');
  }

  const rabiesProto = rabiesProtoRes.rows[0];
  const bcgProto = bcgProtoRes.rows[0];

  console.log(`💉 Rabies Protocol: ${rabiesProto.label} (ID: ${rabiesProto.id}, Vaccine: ${rabiesProto.vaccine_id}, Units: ${rabiesProto.units_per_visit})`);
  console.log(`💉 BCG Protocol:    ${bcgProto.label} (ID: ${bcgProto.id}, Vaccine: ${bcgProto.vaccine_id}, Units: ${bcgProto.units_per_visit})\n`);

  // 3. Clean up active test vials for clean isolation
  await query(
    `UPDATE open_vials
        SET usable = tstzrange(opened_at - interval '2 hours', opened_at - interval '1 hour', '[)')
      WHERE centre_id = $1
        AND usable @> now()`,
    [centre.id]
  );

  // 4. Create a fresh RABIES lot and a fresh BCG lot
  const tag = Date.now().toString(36).toUpperCase();
  const rabiesLotRes = await query(
    `INSERT INTO vial_lots (centre_id, vaccine_id, brand, ml, units_per_vial, open_vial_minutes, expiry, received, remaining_unopened)
     VALUES ($1, 'RABIES', $2, 1.00, 10, 480, '2028-12-31', 10, 9)
     RETURNING id, brand, vaccine_id, units_per_vial`,
    [centre.id, `Rabivax-Isolation-${tag}`]
  );
  const rabiesLot = rabiesLotRes.rows[0];

  const bcgLotRes = await query(
    `INSERT INTO vial_lots (centre_id, vaccine_id, brand, ml, units_per_vial, open_vial_minutes, expiry, received, remaining_unopened)
     VALUES ($1, 'BCG', $2, 1.00, 20, 360, '2028-12-31', 10, 9)
     RETURNING id, brand, vaccine_id, units_per_vial`,
    [centre.id, `BCG-Isolation-${tag}`]
  );
  const bcgLot = bcgLotRes.rows[0];

  console.log(`📦 Seeded Rabies Lot: ${rabiesLot.brand} (vaccine_id: ${rabiesLot.vaccine_id}, 10 units)`);
  console.log(`📦 Seeded BCG Lot:    ${bcgLot.brand} (vaccine_id: ${bcgLot.vaccine_id}, 20 units)`);

  // 5. Open ONE Rabies vial and ONE BCG vial simultaneously at this centre
  const rabiesSerial = `RABIES-VIAL-${tag}`;
  const bcgSerial = `BCG-VIAL-${tag}`;

  const openRabiesRes = await query(
    `INSERT INTO open_vials (centre_id, lot_id, vial_serial, opened_at, usable, units_total, units_used)
     VALUES ($1, $2, $3, now(), tstzrange(now(), now() + interval '8 hours', '[)'), 10, 0)
     RETURNING id, vial_serial, units_total, units_used`,
    [centre.id, rabiesLot.id, rabiesSerial]
  );
  const rabiesVial = openRabiesRes.rows[0];

  const openBcgRes = await query(
    `INSERT INTO open_vials (centre_id, lot_id, vial_serial, opened_at, usable, units_total, units_used)
     VALUES ($1, $2, $3, now(), tstzrange(now(), now() + interval '6 hours', '[)'), 20, 0)
     RETURNING id, vial_serial, units_total, units_used`,
    [centre.id, bcgLot.id, bcgSerial]
  );
  const bcgVial = openBcgRes.rows[0];

  console.log(`\n🔓 Simultaneously Open Vials at ${centre.name}:`);
  console.log(`   1. RABIES Vial: ID ${rabiesVial.id} (Serial: ${rabiesVial.vial_serial}, Capacity: ${rabiesVial.units_total} units)`);
  console.log(`   2. BCG Vial:    ID ${bcgVial.id} (Serial: ${bcgVial.vial_serial}, Capacity: ${bcgVial.units_total} units)`);

  // 6. Create test patients & courses: one Rabies bite patient, one BCG newborn
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  // Rabies patient
  const pRabies = await query(
    `INSERT INTO patients (centre_id, name, phone_e164, language) VALUES ($1, 'Isolation Test Rabies Patient', '+919999900001', 'hi') RETURNING id`,
    [centre.id]
  );
  const cRabies = await query(
    `INSERT INTO courses (patient_id, centre_id, protocol_id, route, day0, status) VALUES ($1, $2, $3, 'ID', $4::date, 'ACTIVE') RETURNING id`,
    [pRabies.rows[0].id, centre.id, rabiesProto.id, today]
  );
  const dRabies = await query(
    `INSERT INTO doses (course_id, route, seq, due_date, status, version) VALUES ($1, 'ID', 1, $2::date, 'DUE', 1) RETURNING id`,
    [cRabies.rows[0].id, today]
  );
  const rabiesDoseId = dRabies.rows[0].id;

  // BCG newborn
  const pBcg = await query(
    `INSERT INTO patients (centre_id, name, phone_e164, language) VALUES ($1, 'Isolation Test BCG Newborn', '+919999900002', 'hi') RETURNING id`,
    [centre.id]
  );
  const cBcg = await query(
    `INSERT INTO courses (patient_id, centre_id, protocol_id, route, day0, status) VALUES ($1, $2, $3, 'ID', $4::date, 'ACTIVE') RETURNING id`,
    [pBcg.rows[0].id, centre.id, bcgProto.id, today]
  );
  const dBcg = await query(
    `INSERT INTO doses (course_id, route, seq, due_date, status, version) VALUES ($1, 'ID', 1, $2::date, 'DUE', 1) RETURNING id`,
    [cBcg.rows[0].id, today]
  );
  const bcgDoseId = dBcg.rows[0].id;

  console.log(`\n👥 Prepared Concurrent Doses:`);
  console.log(`   • Rabies Dose ID: ${rabiesDoseId} (Requires 2 units ID)`);
  console.log(`   • BCG Dose ID:    ${bcgDoseId} (Requires 1 unit ID)`);

  // 7. Fire reservation calls simultaneously
  console.log(`\n⚡ Firing concurrent reserve_units() calls for Rabies and BCG doses...`);
  const [rabiesAllocRes, bcgAllocRes] = await Promise.all([
    query(`SELECT reserve_units($1, $2, $3) AS vial_id`, [rabiesDoseId, centre.id, 2]),
    query(`SELECT reserve_units($1, $2, $3) AS vial_id`, [bcgDoseId, centre.id, 1]),
  ]);

  const allocatedRabiesVialId = rabiesAllocRes.rows[0].vial_id;
  const allocatedBcgVialId = bcgAllocRes.rows[0].vial_id;

  console.log(`\n📊 Allocation Results:`);
  console.log(`   Rabies Dose Allocation: -> Vial ${allocatedRabiesVialId}`);
  console.log(`   BCG Dose Allocation:    -> Vial ${allocatedBcgVialId}`);

  // 8. Query exact dose_reservations and open_vials state
  const reservationsRes = await query(
    `SELECT dr.dose_id, dr.units, dr.open_vial_id, ov.vial_serial, vl.vaccine_id, vl.brand
     FROM dose_reservations dr
     JOIN open_vials ov ON dr.open_vial_id = ov.id
     JOIN vial_lots vl ON ov.lot_id = vl.id
     WHERE dr.dose_id IN ($1, $2)`,
    [rabiesDoseId, bcgDoseId]
  );

  console.log(`\n📋 Database Reservation Ledger:`);
  console.table(reservationsRes.rows);

  const vialsStateRes = await query(
    `SELECT ov.id, ov.vial_serial, vl.vaccine_id, ov.units_total, ov.units_used
     FROM open_vials ov
     JOIN vial_lots vl ON ov.lot_id = vl.id
     WHERE ov.id IN ($1, $2)`,
    [rabiesVial.id, bcgVial.id]
  );

  console.log(`📋 Physical Open Vials State:`);
  console.table(vialsStateRes.rows);

  // 9. Check invariant view
  const invariantRes = await query(`SELECT * FROM v_invariant_violations`);
  const violationsCount = invariantRes.rows.length;

  // 10. Assertions
  const rabiesDrewFromRabies = allocatedRabiesVialId === rabiesVial.id;
  const rabiesDidNotDrawFromBcg = allocatedRabiesVialId !== bcgVial.id;
  const bcgDrewFromBcg = allocatedBcgVialId === bcgVial.id;
  const bcgDidNotDrawFromRabies = allocatedBcgVialId !== rabiesVial.id;
  const zeroViolations = violationsCount === 0;

  console.log('================================================================');
  console.log('  ISOLATION VERIFICATION SUMMARY                                ');
  console.log('================================================================');
  console.log(`  ✓ Rabies dose claimed Rabies vial ONLY:    ${rabiesDrewFromRabies && rabiesDidNotDrawFromBcg ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ✓ BCG dose claimed BCG vial ONLY:          ${bcgDrewFromBcg && bcgDidNotDrawFromRabies ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ✓ Cross-vaccine contamination prevented:   ${rabiesDidNotDrawFromBcg && bcgDidNotDrawFromRabies ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ✓ Database invariant violations:           ${zeroViolations ? '0 VIOLATIONS ✅' : `${violationsCount} VIOLATIONS ❌`}`);
  console.log('================================================================\n');

  if (
    rabiesDrewFromRabies &&
    rabiesDidNotDrawFromBcg &&
    bcgDrewFromBcg &&
    bcgDidNotDrawFromRabies &&
    zeroViolations
  ) {
    console.log('🎉 VACCINE ISOLATION TEST PASSED! The database structurally prevents multi-vaccine cross-draw.');
  } else {
    throw new Error('Vaccine isolation assertions failed.');
  }
}

runVaccineIsolationTest()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Fatal isolation test error:', err);
    pool.end();
    process.exit(1);
  });
