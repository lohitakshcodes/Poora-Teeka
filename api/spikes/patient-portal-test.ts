import fs from 'node:fs';
import path from 'node:path';
import { query, pool } from '../src/db';
import { handler as patientsHandler } from '../src/handlers/patients';

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

async function runPatientPortalTest() {
  console.log('================================================================');
  console.log('  Poora Teeka - Live Patient Status Portal Test (P2 Verification)');
  console.log('================================================================');

  // 1. Resolve centre
  const centreRes = await query(`SELECT id, name, city FROM centres LIMIT 1`);
  const centre = centreRes.rows[0];
  console.log(`🏥 Centre: ${centre.name} (${centre.city})`);

  // 2. Register real test patient via POST /patients
  const uniqueName = `Pooja Sharma ${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const phone = `+91982233${Math.floor(1000 + Math.random() * 9000)}`;
  console.log(`\n👤 Registering patient: "${uniqueName}" (${phone}, Marathi lang)...`);

  const registerEvent: any = {
    requestContext: { http: { method: 'POST', path: '/patients' } },
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: uniqueName,
      phone_e164: phone,
      language: 'mr',
      centre_id: centre.id,
    }),
  };

  const registerRes: any = await patientsHandler(registerEvent);
  const patientData = JSON.parse(registerRes.body as string);
  console.log('✅ Patient Registered:');
  console.log(`   ID:           ${patientData.id}`);
  console.log(`   Status Token: ${patientData.status_token}`);

  // 3. Create course for this patient with 4 doses
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const cRes = await query(
    `INSERT INTO courses (patient_id, centre_id, protocol_id, route, day0, status)
     VALUES ($1, $2, 'thai_red_cross_id', 'ID', $3::date, 'ACTIVE')
     RETURNING id`,
    [patientData.id, centre.id, today]
  );
  const courseId = cRes.rows[0].id;

  // Insert 4 doses (Day 0, 3, 7, 28)
  const offsets = [0, 3, 7, 28];
  for (let i = 0; i < offsets.length; i++) {
    const seq = i + 1;
    const status = seq === 1 ? 'GIVEN' : 'DUE';
    const givenAt = seq === 1 ? new Date().toISOString() : null;
    await query(
      `INSERT INTO doses (course_id, route, seq, due_date, status, given_at, version)
       VALUES ($1, 'ID', $2, ($3::date + $4 * interval '1 day')::date, $5, $6, 1)`,
      [courseId, seq, today, offsets[i], status, givenAt]
    );
  }
  console.log(`✅ Course created with 4 doses (Dose 1 marked GIVEN, Doses 2-4 pending)`);

  // 4. Test GET /patients/status/{token}
  console.log(`\n🔍 Fetching GET /patients/status/${patientData.status_token}...`);
  const statusEvent: any = {
    rawPath: `/patients/status/${patientData.status_token}`,
    pathParameters: { token: patientData.status_token },
    requestContext: { http: { method: 'GET', path: `/patients/status/${patientData.status_token}` } },
    headers: {},
  };

  const statusRes: any = await patientsHandler(statusEvent);
  console.log(`HTTP Status: ${statusRes.statusCode}`);
  const statusData = JSON.parse(statusRes.body as string);

  console.log('\n📋 Live Patient Portal Response Payload:');
  console.dir(statusData, { depth: null });

  // 5. Assertions
  const isCorrectName = statusData.firstName === 'Pooja';
  const isCorrectLang = statusData.language === 'mr';
  const isCorrectDoses = statusData.dosesGiven === 1 && statusData.dosesTotal === 4;
  const hasNextDueDate = Boolean(statusData.nextDueDate);
  const isNotRamesh = statusData.firstName !== 'Ramesh';

  console.log('\n================================================================');
  console.log('  PORTAL VERIFICATION SUMMARY                                   ');
  console.log('================================================================');
  console.log(`  ✓ Real patient name returned (Pooja):     ${isCorrectName ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ✓ Not static mock content ("Ramesh"):      ${isNotRamesh ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ✓ Patient language preserved ('mr'):       ${isCorrectLang ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ✓ Accurate live dose progress (1 of 4):    ${isCorrectDoses ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ✓ Next dose date populated:                ${hasNextDueDate ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log('================================================================\n');

  if (isCorrectName && isNotRamesh && isCorrectLang && isCorrectDoses && hasNextDueDate) {
    console.log('🎉 PATIENT PORTAL TEST PASSED! Real data feeds /patients/status/{token} cleanly.');
  } else {
    throw new Error('Patient portal assertions failed.');
  }
}

runPatientPortalTest()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Fatal portal test error:', err);
    pool.end();
    process.exit(1);
  });
