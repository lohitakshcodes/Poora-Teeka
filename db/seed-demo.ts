import { pool, query, withTransaction } from '../api/src/db';
import { handler as missedDoseSweepHandler } from '../api/src/handlers/missed-dose-sweep';

const CENTRE_ID = 'a0000000-0000-0000-0000-000000000001';

interface ProtocolInfo {
  id: string;
  route: string;
  visit_offsets: number[];
  units_per_visit: number;
}

async function seedDemo() {
  console.log('================================================================');
  console.log('  Poora Teeka - Demo Seeding (C13): Monsoon Season Surge        ');
  console.log('================================================================');
  console.log(`Database Host: ${process.env.DB_HOST}`);
  console.log(`Centre ID:     ${CENTRE_ID}`);
  console.log(`Timestamp:     ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  try {
    // 1. Verify centre and protocols
    console.log('🔍 Step 1: Verifying centre and protocols...');
    const centreRes = await query('SELECT id, name, city FROM centres WHERE id = $1', [CENTRE_ID]);
    if (centreRes.rows.length === 0) {
      throw new Error(`Centre ${CENTRE_ID} not found. Please run db/seed.sql first.`);
    }
    console.log(`✅ Centre: ${centreRes.rows[0].name} (${centreRes.rows[0].city})`);

    const protoRes = await query<ProtocolInfo>('SELECT id, route, visit_offsets, units_per_visit FROM protocols');
    const protocols: Record<string, ProtocolInfo> = {};
    for (const p of protoRes.rows) {
      protocols[p.id] = p;
    }
    console.log(`✅ Loaded protocols: ${Object.keys(protocols).join(', ')}`);

    // 2. Ensure active stock in vial_lots
    console.log('\n🔍 Step 2: Replenishing fresh vial lots in clinic inventory...');
    const idLotRes = await query(
      `INSERT INTO vial_lots (centre_id, brand, ml, units_per_vial, expiry, received, remaining_unopened)
       VALUES ($1, 'Rabivax-S Monsoon 2026', 1.00, 10, '2028-12-31', 200, 200)
       RETURNING id`,
      [CENTRE_ID]
    );
    const idLotId = idLotRes.rows[0].id;

    const imLotRes = await query(
      `INSERT INTO vial_lots (centre_id, brand, ml, units_per_vial, expiry, received, remaining_unopened)
       VALUES ($1, 'Rabipur-IM Monsoon 2026', 1.00, 1, '2028-12-31', 100, 100)
       RETURNING id`,
      [CENTRE_ID]
    );
    const imLotId = imLotRes.rows[0].id;
    console.log(`✅ Stocked ID lot (${idLotId}) and IM lot (${imLotId}) with 300 unopened vials.`);

    // 3. Generate 60 synthetic patients and courses
    console.log('\n🔍 Step 3: Generating 60 synthetic patients with monsoon-weighted arrival dates...');
    const today = new Date();

    const totalPatients = 60;
    const patientIds: string[] = [];

    const formatDate = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const addDays = (d: Date, days: number): Date => {
      const res = new Date(d);
      res.setDate(res.getDate() + days);
      return res;
    };

    let totalDosesCreated = 0;
    let totalGivenDoses = 0;
    let totalOverdueDoses = 0;
    let totalScheduledDoses = 0;

    const givenDosesToReserve: { doseId: string; units: number; givenAt: string; route: string }[] = [];

    for (let i = 1; i <= totalPatients; i++) {
      const isPediatric = i % 4 === 0; // 25% pediatric minors
      const pad = String(i).padStart(2, '0');
      const fakeName = isPediatric ? `Synthetic Minor Patient-${pad}` : `Synthetic Adult Patient-${pad}`;
      const phone = `+9190000000${pad}`;
      const guardianPhone = isPediatric ? `+9191111100${pad}` : null;
      const lang = i % 3 === 0 ? 'mr' : i % 3 === 1 ? 'hi' : 'en';

      // Insert patient
      const pRes = await query(
        `INSERT INTO patients (centre_id, name, phone_e164, language, guardian_phone, consent_at)
         VALUES ($1, $2, $3, $4, $5, now())
         RETURNING id`,
        [CENTRE_ID, fakeName, phone, lang, guardianPhone]
      );
      const patientId = pRes.rows[0].id;
      patientIds.push(patientId);

      // Route: ~75% ID, 25% IM
      const isIM = i % 4 === 0;
      const protocolId = isIM ? 'essen_im' : 'thai_red_cross_id';
      const proto = protocols[protocolId];

      // Monsoon surge weighting:
      // i <= 40: 1 to 14 days ago
      // i > 40: 15 to 30 days ago
      let daysAgo: number;
      if (i <= 40) {
        daysAgo = Math.floor(Math.random() * 14) + 1;
      } else {
        daysAgo = Math.floor(Math.random() * 16) + 15;
      }

      const day0Date = addDays(today, -daysAgo);
      const day0Str = formatDate(day0Date);

      // Insert course
      const courseRes = await query(
        `INSERT INTO courses (patient_id, centre_id, protocol_id, route, day0, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         RETURNING id`,
        [patientId, CENTRE_ID, proto.id, proto.route, day0Str]
      );
      const courseId = courseRes.rows[0].id;

      // ~7 patients will have an overdue/missed dose
      const willHaveMissedDose = i % 8 === 0;

      for (let seqIdx = 0; seqIdx < proto.visit_offsets.length; seqIdx++) {
        const seq = seqIdx + 1;
        const offset = proto.visit_offsets[seqIdx];
        const dueDate = addDays(day0Date, offset);
        const dueDateStr = formatDate(dueDate);
        const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        let status = 'SCHEDULED';
        let givenAt: string | null = null;

        if (diffDays < 0) {
          if (willHaveMissedDose && seqIdx === 1) {
            // Intentionally leave overdue with status 'DUE' so sweep processes it!
            status = 'DUE';
            totalOverdueDoses++;
          } else {
            status = 'GIVEN';
            givenAt = `${dueDateStr} 11:30:00+05:30`;
            totalGivenDoses++;
          }
        } else if (diffDays === 0) {
          status = 'DUE';
          totalScheduledDoses++;
        } else {
          status = 'SCHEDULED';
          totalScheduledDoses++;
        }

        const doseRes = await query(
          `INSERT INTO doses (course_id, route, seq, due_date, status, given_at, version)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           RETURNING id`,
          [courseId, proto.route, seq, dueDateStr, status, givenAt]
        );
        const doseId = doseRes.rows[0].id;
        totalDosesCreated++;

        if (status === 'GIVEN' && givenAt) {
          givenDosesToReserve.push({
            doseId,
            units: proto.units_per_visit,
            givenAt,
            route: proto.route,
          });
        }
      }
    }

    console.log(`✅ Seeded ${totalPatients} synthetic patients & courses.`);
    console.log(`   Total Doses:      ${totalDosesCreated}`);
    console.log(`   Historical GIVEN: ${totalGivenDoses}`);
    console.log(`   Overdue (for sweep test): ${totalOverdueDoses}`);
    console.log(`   Active DUE/SCHED: ${totalScheduledDoses}`);

    // 4. Create legitimate historical open vials & reservations for GIVEN doses
    console.log('\n🔍 Step 4: Ledgering historical vial reservations to maintain invariant integrity...');
    const idGiven = givenDosesToReserve.filter((d) => d.route === 'ID');
    const imGiven = givenDosesToReserve.filter((d) => d.route === 'IM');

    // Group ID doses into batches of 5 (10 units per vial)
    for (let i = 0; i < idGiven.length; i += 5) {
      const batch = idGiven.slice(i, i + 5);
      const unitsUsed = batch.reduce((acc, cur) => acc + cur.units, 0);
      const sampleDate = batch[0].givenAt;
      const serial = `HIST-ID-${Date.now().toString(36).toUpperCase()}-${i}`;

      const vialRes = await query(
        `INSERT INTO open_vials (centre_id, lot_id, vial_serial, opened_at, usable, units_total, units_used)
         VALUES (
           $1, $2, $3,
           $4::timestamptz,
           tstzrange($4::timestamptz, $4::timestamptz + interval '6 hours'),
           10,
           $5
         )
         RETURNING id`,
        [CENTRE_ID, idLotId, serial, sampleDate, unitsUsed]
      );
      const openVialId = vialRes.rows[0].id;

      for (const d of batch) {
        await query(
          `INSERT INTO dose_reservations (dose_id, open_vial_id, units, taken_at)
           VALUES ($1, $2, $3, $4::timestamptz)`,
          [d.doseId, openVialId, d.units, d.givenAt]
        );
      }
    }

    // Group IM doses (1 unit per vial)
    for (let i = 0; i < imGiven.length; i++) {
      const d = imGiven[i];
      const serial = `HIST-IM-${Date.now().toString(36).toUpperCase()}-${i}`;
      const vialRes = await query(
        `INSERT INTO open_vials (centre_id, lot_id, vial_serial, opened_at, usable, units_total, units_used)
         VALUES (
           $1, $2, $3,
           $4::timestamptz,
           tstzrange($4::timestamptz, $4::timestamptz + interval '6 hours'),
           1,
           1
         )
         RETURNING id`,
        [CENTRE_ID, imLotId, serial, d.givenAt]
      );
      const openVialId = vialRes.rows[0].id;

      await query(
        `INSERT INTO dose_reservations (dose_id, open_vial_id, units, taken_at)
         VALUES ($1, $2, $3, $4::timestamptz)`,
        [d.doseId, openVialId, d.units, d.givenAt]
      );
    }

    console.log(`✅ Ledgered reservations for all ${givenDosesToReserve.length} historical doses.`);

    // 5. Check schema invariant violations immediately
    console.log('\n🔍 Step 5: Checking schema invariant view (v_invariant_violations)...');
    const invRes = await query('SELECT * FROM v_invariant_violations');
    if (invRes.rows.length === 0) {
      console.log('✅ Invariant check passed: 0 violations in v_invariant_violations.');
    } else {
      console.error('❌ Invariant violations detected:', invRes.rows);
      throw new Error('Invariant violations detected after seeding historical doses.');
    }

    // 6. Trigger missed-dose sweep handler (with Jev System One enrichment)
    console.log('\n🔍 Step 6: Triggering missed-dose sweep to triage overdue doses with Jev System One...');
    const sweepResult = await missedDoseSweepHandler();
    console.log(`✅ Missed-dose sweep finished. Processed: ${sweepResult.processed} overdue doses.`);

    // 7. Run required SQL verification query
    console.log('\n🔍 Step 7: Verifying Jev escalation_level and dropout_risk on MISSED doses:');
    console.log('----------------------------------------------------------------');
    console.log("SQL: SELECT seq AS seq_no, status, escalation_level, dropout_risk FROM doses WHERE status = 'MISSED' ORDER BY seq ASC;");
    console.log('----------------------------------------------------------------');

    const missedCheckRes = await query(
      `SELECT
         d.id AS dose_id,
         d.seq AS seq_no,
         d.status,
         d.escalation_level,
         ROUND(d.dropout_risk::numeric, 2) AS dropout_risk,
         p.name AS patient_name,
         to_char(d.due_date, 'YYYY-MM-DD') AS due_date
       FROM doses d
       JOIN courses c ON c.id = d.course_id
       JOIN patients p ON p.id = c.patient_id
      WHERE d.status = 'MISSED'
      ORDER BY d.due_date DESC, d.seq ASC`
    );

    console.table(missedCheckRes.rows);

    const enrichedCount = missedCheckRes.rows.filter((r) => r.escalation_level !== null).length;
    console.log(`\n🎉 Verified: ${enrichedCount} of ${missedCheckRes.rows.length} MISSED doses have Jev escalation levels populated!`);

    console.log('\n================================================================');
    console.log('  Demo Seeding & Jev Missed-Dose Sweep Complete!                ');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ Error during demo seeding:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDemo();
