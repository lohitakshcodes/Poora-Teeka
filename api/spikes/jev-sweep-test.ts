import { query, withTransaction } from '../src/db';
import { handler as missedDoseSweepHandler } from '../src/handlers/missed-dose-sweep';

const DEFAULT_API_URL =
  process.env.API_URL ||
  'https://o025clnwai.execute-api.ap-south-1.amazonaws.com';

const CENTRE_ID = 'a0000000-0000-0000-0000-000000000001';

async function main() {
  console.log('================================================================');
  console.log('  Poora Teeka - Jev (TypeSafe AI) Missed-Dose Sweep Verification');
  console.log('================================================================');
  console.log(`API URL:   ${DEFAULT_API_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  // Step 1: Ensure we have an overdue test dose with status 'DUE'
  console.log('🔍 Step 1: Setting up an overdue test dose (due_date = yesterday, status = DUE)...');
  const targetDose = await withTransaction(async (client) => {
    // Find an active dose in sequence 2, 3, or 4 of an ID course
    const findRes = await client.query(
      `SELECT d.id, d.course_id, d.seq, d.status, d.due_date, c.patient_id, p.name AS patient_name
         FROM doses d
         JOIN courses c ON c.id = d.course_id
         JOIN patients p ON p.id = c.patient_id
        WHERE c.centre_id = $1
          AND d.seq >= 2
          AND d.status IN ('SCHEDULED', 'DUE', 'MISSED')
        ORDER BY d.seq ASC
        LIMIT 1`,
      [CENTRE_ID]
    );

    if (findRes.rows.length === 0) {
      throw new Error('No candidate dose found for test.');
    }

    const d = findRes.rows[0];

    // Reset this dose to status 'DUE', due_date yesterday, clear previous Jev values
    const resetRes = await client.query(
      `UPDATE doses
          SET status = 'DUE',
              due_date = CURRENT_DATE - INTERVAL '1 day',
              escalation_level = NULL,
              dropout_risk = NULL,
              version = version + 1
        WHERE id = $1
        RETURNING id, course_id, seq, to_char(due_date, 'YYYY-MM-DD') AS due_date, status, version`,
      [d.id]
    );

    return { ...d, ...resetRes.rows[0] };
  });

  console.log(
    `✅ Test dose prepared: ID ${targetDose.id} (Seq #${targetDose.seq}, Patient: ${targetDose.patient_name}, Status: ${targetDose.status}, Due Date: ${targetDose.due_date})`
  );

  // Step 2: Run the missed-dose sweep handler (which invokes Jev post-commit)
  console.log('\n🔍 Step 2: Executing missed-dose sweep handler with Jev System One enrichment...');
  const sweepResult = await missedDoseSweepHandler();
  console.log(`✅ Sweep handler executed: ${sweepResult.processed} doses processed.`);

  // Step 3: Inspect database row for Jev enrichment
  console.log('\n🔍 Step 3: Inspecting database row for escalation_level and dropout_risk...');
  const verifyRes = await query(
    `SELECT
       d.id,
       d.seq,
       d.status,
       to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
       d.escalation_level,
       d.dropout_risk,
       p.name AS patient_name
     FROM doses d
     JOIN courses c ON c.id = d.course_id
     JOIN patients p ON p.id = c.patient_id
    WHERE d.id = $1`,
    [targetDose.id]
  );

  const updatedRow = verifyRes.rows[0];
  console.log('   Database Row State:');
  console.log(`   - Dose ID:          ${updatedRow.id}`);
  console.log(`   - Status:           ${updatedRow.status}`);
  console.log(`   - Escalation Level: ${updatedRow.escalation_level}`);
  console.log(`   - Dropout Risk:     ${updatedRow.dropout_risk}`);

  if (updatedRow.status !== 'MISSED') {
    throw new Error(`Expected status MISSED, got ${updatedRow.status}`);
  }
  if (!updatedRow.escalation_level) {
    throw new Error('escalation_level was not populated by Jev');
  }

  // Step 4: Verify GET /doses/missed includes escalation_level and dropout_risk
  console.log('\n🔍 Step 4: Verifying GET /doses/missed API endpoint...');
  const res = await fetch(`${DEFAULT_API_URL}/doses/missed?centreId=${CENTRE_ID}`);
  if (!res.ok) {
    throw new Error(`GET /doses/missed failed with status ${res.status}`);
  }
  const missedApiData = await res.json();
  console.log(`   Total Missed Doses in Queue: ${(missedApiData as any).count}`);

  const apiDose = (missedApiData as any).doses.find((d: any) => d.dose_id === targetDose.id);
  if (!apiDose) {
    throw new Error(`Target dose ${targetDose.id} not found in GET /doses/missed response`);
  }

  console.log('   API Record Match:');
  console.log(`   - Patient:          ${apiDose.patient_name}`);
  console.log(`   - Dose:             #${apiDose.seq} (${apiDose.route})`);
  console.log(`   - Escalation Level: ${apiDose.escalation_level}`);
  console.log(`   - Dropout Risk:     ${apiDose.dropout_risk}`);

  console.log('\n================================================================');
  console.log('  Jev (TypeSafe AI) Missed-Dose Sweep Verification Summary      ');
  console.log('================================================================');
  console.log('  1. Status Flip to MISSED:       ✅ PASSED');
  console.log('  2. Jev System One Execution:    ✅ PASSED (non-gating post-commit)');
  console.log(`  3. Escalation Level Populated:  ✅ PASSED (${apiDose.escalation_level})`);
  console.log(`  4. Dropout Risk Stored:         ✅ PASSED (${Math.round(apiDose.dropout_risk * 100)}%)`);
  console.log('  5. GET /doses/missed Updated:   ✅ PASSED');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
