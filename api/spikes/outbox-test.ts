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
    } catch {}
  }
}

const API_URL =
  process.env.API_URL || 'https://o025clnwai.execute-api.ap-south-1.amazonaws.com';

async function runOutboxVerification() {
  console.log('================================================================');
  console.log('  Poora Teeka - Outbox & Async Reminder Pipeline Verification   ');
  console.log('================================================================');
  console.log(`API URL:    ${API_URL}`);
  console.log(`DB Host:    ${process.env.DB_HOST}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  // 1. Resolve centre
  const centreRes = await query(`SELECT id, name FROM centres LIMIT 1`);
  if (centreRes.rows.length === 0) {
    throw new Error('No centre found in database.');
  }
  const centre = centreRes.rows[0];
  console.log(`🏥 Centre:   ${centre.name} (${centre.id})`);

  // 2. Create test patient
  const patientName = `Outbox Test Patient ${Date.now().toString(36).toUpperCase()}`;
  const phone = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;

  console.log(`\n👤 Creating test patient: ${patientName} (${phone})...`);
  const patientRes = await fetch(`${API_URL}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: patientName,
      phone_e164: phone,
      language: 'hi',
      centre_id: centre.id,
    }),
  });

  if (!patientRes.ok) {
    throw new Error(`Failed to create patient: ${patientRes.status} - ${await patientRes.text()}`);
  }
  const patient = (await patientRes.json()) as any;
  console.log(`✅ Patient created: ID ${patient.id}`);

  // 3. Create course via POST /courses (Updated Thai Red Cross ID: offsets {0, 3, 7, 28})
  console.log(`\n📅 Creating vaccination course (protocol: thai_red_cross_id)...`);
  const idempotencyKey = `test-outbox-course-${Date.now()}`;
  const courseRes = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      patientId: patient.id,
      protocolId: 'thai_red_cross_id',
      centreId: centre.id,
    }),
  });

  if (!courseRes.ok) {
    throw new Error(`Failed to create course: ${courseRes.status} - ${await courseRes.text()}`);
  }

  const courseData = (await courseRes.json()) as any;
  console.log(`✅ Course created: ID ${courseData.course.id}, Route: ${courseData.course.route}`);
  console.log(`   Doses generated: ${courseData.doses.length}`);
  courseData.doses.forEach((d: any) => {
    console.log(`   - Seq ${d.seq}: Due ${d.due_date}, Status: ${d.status}`);
  });

  // 4. Verify DB records created in the SAME transaction
  console.log(`\n🔍 Verifying Reminders & Outbox rows created in database transaction...`);
  const remQuery = await query(
    `SELECT r.id, r.dose_id, r.kind, r.scheduled_for, r.status, r.schedule_name, r.idempotency_key,
            d.seq, d.due_date
       FROM reminders r
       JOIN doses d ON d.id = r.dose_id
      WHERE d.course_id = $1
      ORDER BY d.seq ASC`,
    [courseData.course.id]
  );

  console.log(`   Found ${remQuery.rows.length} pre-dose reminders in database:`);
  remQuery.rows.forEach((r: any) => {
    console.log(
      `   • Reminder ID:   ${r.id}\n` +
      `     Dose Seq:      ${r.seq} (Due: ${r.due_date})\n` +
      `     Kind:          ${r.kind}\n` +
      `     Scheduled For: ${new Date(r.scheduled_for).toISOString()}\n` +
      `     Status:        ${r.status}\n` +
      `     Schedule Name: ${r.schedule_name || '(awaiting async creation)'}`
    );
  });

  const outboxQuery = await query(
    `SELECT id, topic, payload, published_at, created_at
       FROM outbox
      WHERE payload->>'reminderId' = ANY($1::text[])`,
    [remQuery.rows.map((r: any) => r.id)]
  );

  console.log(`\n   Found ${outboxQuery.rows.length} outbox rows for these reminders:`);
  outboxQuery.rows.forEach((o: any) => {
    console.log(
      `   • Outbox ID:    ${o.id}\n` +
      `     Topic:        ${o.topic}\n` +
      `     Payload:      ${JSON.stringify(o.payload)}\n` +
      `     Published At: ${o.published_at || 'NULL (unpublished)'}`
    );
  });

  // 5. Poll for async pipeline execution (outbox poller -> SQS -> schedule-creator -> EventBridge Scheduler)
  console.log(`\n⏳ Awaiting async outbox processing (EventBridge rule runs every 60s)...`);
  const maxWaitSec = 120;
  const pollIntervalSec = 5;
  let allScheduled = false;

  for (let elapsed = 0; elapsed < maxWaitSec; elapsed += pollIntervalSec) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalSec * 1000));
    process.stdout.write(`   Waiting... (${elapsed + pollIntervalSec}s elapsed)\r`);

    // Check reminders schedule_name
    const checkRem = await query(
      `SELECT id, schedule_name, status
         FROM reminders
        WHERE id = ANY($1::uuid[])`,
      [remQuery.rows.map((r: any) => r.id)]
    );

    const completed = checkRem.rows.filter((r: any) => Boolean(r.schedule_name));
    if (completed.length === remQuery.rows.length) {
      allScheduled = true;
      console.log(`\n\n🎉 All ${completed.length} reminders successfully processed and scheduled!`);
      break;
    }
  }

  if (!allScheduled) {
    console.warn(`\n⚠️ Polling timed out after ${maxWaitSec}s; checking partial progress...`);
  }

  // 6. Final verification of Outbox and Reminders
  const finalOutbox = await query(
    `SELECT id, topic, published_at
       FROM outbox
      WHERE payload->>'reminderId' = ANY($1::text[])`,
    [remQuery.rows.map((r: any) => r.id)]
  );

  console.log(`\n📊 Final Outbox Publishing Status:`);
  finalOutbox.rows.forEach((o: any) => {
    console.log(`   • Outbox #${o.id}: published_at = ${o.published_at ? o.published_at.toISOString() : 'STILL NULL'}`);
  });

  const finalRem = await query(
    `SELECT r.id, r.schedule_name, r.status, r.scheduled_for, d.seq, d.due_date
       FROM reminders r
       JOIN doses d ON d.id = r.dose_id
      WHERE r.id = ANY($1::uuid[])
      ORDER BY d.seq ASC`,
    [remQuery.rows.map((r: any) => r.id)]
  );

  console.log(`\n📊 Final Reminders Schedule Association:`);
  finalRem.rows.forEach((r: any) => {
    console.log(
      `   • Dose #${r.seq} (Due ${r.due_date}): schedule_name = ${r.schedule_name} | status = ${r.status}`
    );
  });

  await pool.end();
}

runOutboxVerification().catch(async (err) => {
  console.error('\n❌ Outbox verification failed with error:', err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
