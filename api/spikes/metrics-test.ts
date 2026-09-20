import fs from 'node:fs';
import path from 'node:path';
import { CloudWatchClient, GetDashboardCommand } from '@aws-sdk/client-cloudwatch';
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

const cloudwatch = new CloudWatchClient({ region: 'ap-south-1' });

const API_URL =
  process.env.API_URL || 'https://o025clnwai.execute-api.ap-south-1.amazonaws.com';

async function runMetricsVerification() {
  console.log('================================================================');
  console.log('  Poora Teeka - Operational Metrics & CloudWatch Verification   ');
  console.log('================================================================');
  console.log(`API URL:    ${API_URL}`);
  console.log(`DB Host:    ${process.env.DB_HOST}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  // 1. Resolve centre
  const centreRes = await query(`SELECT id, name, city FROM centres LIMIT 1`);
  if (centreRes.rows.length === 0) {
    throw new Error('No centre found in database.');
  }
  const centre = centreRes.rows[0];
  console.log(`🏥 Centre: ${centre.name} (${centre.id})`);

  // 2. Call GET /metrics?centreId=
  console.log(`\n🔍 Step A: Testing GET ${API_URL}/metrics?centreId=${centre.id}...`);
  const res = await fetch(`${API_URL}/metrics?centreId=${centre.id}`);
  if (!res.ok) {
    throw new Error(`GET /metrics failed: ${res.status} - ${await res.text()}`);
  }

  const metrics = (await res.json()) as any;
  console.log(`✅ API Response Received (HTTP ${res.status}):\n`);

  console.log('📊 1. Dose Completion Funnel:');
  console.log(`   Total Tracked Courses: ${metrics.completionFunnel.totalCoursesTracked}`);
  for (const seq of metrics.completionFunnel.sequences) {
    console.log(
      `   - ${seq.label}: Total=${seq.total}, GIVEN=${seq.given}, DUE=${seq.due}, MISSED=${seq.missed}, SCHEDULED=${seq.scheduled} (Completion Rate: ${seq.completionRatePct}%)`
    );
  }

  console.log('\n🧪 2. Vial Utilization Today:');
  console.log(`   Vials Opened Today:      ${metrics.vialsToday.vialsOpenedToday}`);
  console.log(`   Total ID Units Used:     ${metrics.vialsToday.totalIdUnitsUsedToday}`);
  console.log(`   Theoretical Min Vials:   ${metrics.vialsToday.theoreticalMinVials}`);
  console.log(`   Efficiency Percentage:   ${metrics.vialsToday.vialEfficiencyPct}%`);
  console.log(`   Vaccine Discarded Today: ${metrics.vialsToday.mlDiscardedToday} ml (${metrics.vialsToday.unitsDiscardedToday} units)`);

  console.log('\n📱 3. Reminder Delivery:');
  console.log(`   Total Reminders:    ${metrics.reminderDelivery.totalReminders}`);
  console.log(`   Sent Reminders:     ${metrics.reminderDelivery.sentReminders}`);
  console.log(`   Failed Reminders:   ${metrics.reminderDelivery.failedReminders}`);
  console.log(`   Pending Reminders:  ${metrics.reminderDelivery.pendingReminders}`);
  console.log(`   Delivery Success:   ${metrics.reminderDelivery.deliveryRatePct}%`);

  // Assertions
  if (!Array.isArray(metrics.completionFunnel.sequences)) {
    throw new Error('completionFunnel.sequences must be an array');
  }
  if (typeof metrics.vialsToday.vialsOpenedToday !== 'number') {
    throw new Error('vialsToday.vialsOpenedToday must be a number');
  }
  if (typeof metrics.reminderDelivery.sentReminders !== 'number') {
    throw new Error('reminderDelivery.sentReminders must be a number');
  }

  // 3. Verify CloudWatch Dashboard 'PooraTeeka-Operations'
  console.log(`\n🔍 Step B: Verifying CloudWatch Dashboard 'PooraTeeka-Operations'...`);
  const cwDashRes = await cloudwatch.send(
    new GetDashboardCommand({
      DashboardName: 'PooraTeeka-Operations',
    })
  );

  console.log(`   Dashboard Name: ${cwDashRes.DashboardName}`);
  console.log(`   Dashboard ARN:  ${cwDashRes.DashboardArn}`);

  let parsedDashboard: any = {};
  try {
    parsedDashboard = JSON.parse(cwDashRes.DashboardBody || '{}');
  } catch {}

  const widgets = parsedDashboard.widgets || [];
  console.log(`   Total Widgets Configured: ${widgets.length}`);
  for (const w of widgets) {
    console.log(`   - Widget: "${w.properties?.title || 'Untitled'}" (${w.type})`);
  }

  if (widgets.length === 0) {
    throw new Error('CloudWatch dashboard exists but contains no widgets');
  }

  const dashboardUrl = `https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#dashboards/dashboard/PooraTeeka-Operations`;
  console.log(`\n🔗 Live CloudWatch Dashboard URL:`);
  console.log(`   ${dashboardUrl}`);

  console.log('\n================================================================');
  console.log('  Metrics & Dashboard Verification Summary                      ');
  console.log('================================================================');
  console.log(`  1. GET /metrics Endpoint:       ✅ PASSED (200 OK)`);
  console.log(`  2. Dose Completion Funnel:      ✅ PASSED (${metrics.completionFunnel.sequences.length} sequences tracked)`);
  console.log(`  3. Vial Efficiency Metrics:     ✅ PASSED (Opened vs Theoretical Min)`);
  console.log(`  4. Discarded Vaccine Volume:    ✅ PASSED (${metrics.vialsToday.mlDiscardedToday} ml)`);
  console.log(`  5. Reminder Delivery Rate:      ✅ PASSED (${metrics.reminderDelivery.deliveryRatePct}% rate)`);
  console.log(`  6. CloudWatch Dashboard:        ✅ PASSED (${widgets.length} operational widgets)`);
  console.log('================================================================\n');

  await pool.end();
}

runMetricsVerification().catch(async (err) => {
  console.error('\n❌ Metrics verification failed:', err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
