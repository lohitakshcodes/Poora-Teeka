import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { choice, noul, TypeSafeClient } from '@typesafe-ai/sdk';
import { query, withTransaction } from '../db';

const cloudwatch = new CloudWatchClient({});
const secretsManager = new SecretsManagerClient({});

const CLOUDWATCH_NAMESPACE = process.env.CLOUDWATCH_NAMESPACE || 'PooraTeeka';
const TYPESAFE_SECRET_NAME = process.env.TYPESAFE_SECRET_NAME || 'poora-teeka/typesafe';

let jevClient: TypeSafeClient | null = null;

/**
 * Initialize TypeSafeClient at cold start:
 * 1. Checks process.env.TYPESAFE_API_KEY
 * 2. Fallbacks to AWS Secrets Manager (poora-teeka/typesafe)
 */
async function initTypeSafeClient(): Promise<TypeSafeClient | null> {
  if (jevClient) return jevClient;

  if (process.env.TYPESAFE_API_KEY) {
    jevClient = new TypeSafeClient();
    return jevClient;
  }

  try {
    const secRes = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: TYPESAFE_SECRET_NAME })
    );
    if (secRes.SecretString) {
      try {
        const parsed = JSON.parse(secRes.SecretString);
        const apiKey = parsed.apiKey || parsed.TYPESAFE_API_KEY;
        if (apiKey) {
          process.env.TYPESAFE_API_KEY = apiKey;
          jevClient = new TypeSafeClient();
          return jevClient;
        }
      } catch {
        // Plain text secret
        process.env.TYPESAFE_API_KEY = secRes.SecretString;
        jevClient = new TypeSafeClient();
        return jevClient;
      }
    }
  } catch (err: any) {
    console.warn('[missed-dose-sweep] Could not fetch TYPESAFE_API_KEY from Secrets Manager:', err.message);
  }

  return null;
}

/**
 * Missed-Dose Sweep Handler
 * 
 * NOTE: In a real production deployment, this sweep would run once or twice daily
 * (e.g. at 20:00 IST after outpatient clinic hours close).
 * The 5-minute interval configured on EventBridge is for demo/testing purposes.
 * 
 * Logic:
 * 1. Read configurable grace period from environment variables:
 *    - MISSED_DOSE_GRACE_MINUTES (default: 0)
 *    - MISSED_DOSE_GRACE_HOURS (fallback if minutes not set)
 * 2. In a single atomic transaction:
 *    - Select doses with status 'DUE' where the due_date + grace period has passed in IST.
 *    - Uses FOR UPDATE OF d SKIP LOCKED for zero contention across parallel workers.
 *    - Updates each dose to status 'MISSED' (with optimistic locking version increment).
 *    - Inserts a 'MISSED'-kind reminder with scheduled_for = now().
 *    - Inserts a matching row into the 'outbox' table (topic 'schedule-reminder').
 * 3. Commits transaction and emits CloudWatch custom metric 'DosesMarkedMissed'.
 * 4. Jev System One Enrichment (TypeSafe AI):
 *    - STRICTLY AFTER database transaction commits (enrichment, non-gating).
 *    - Queries patient course context (missed, given, total, days since last dose, days remaining).
 *    - Asks Jev for escalation_level ('routine' | 'priority' | 'critical') and high_risk_dropout.
 *    - Updates dose row with escalation_level and dropout_risk.
 *    - Wrapped in try/catch: failures are logged and NEVER fail or block the sweep.
 */
export const handler = async (event?: any): Promise<{ processed: number; doses: any[] }> => {
  console.log('[missed-dose-sweep] Invoked at:', new Date().toISOString());

  // Configurable grace period (defaults to 0 minutes for demo/hackathon responsiveness)
  const graceMinutes = parseInt(
    process.env.MISSED_DOSE_GRACE_MINUTES ||
      String((parseInt(process.env.MISSED_DOSE_GRACE_HOURS || '0', 10) * 60)),
    10
  ) || 0;

  console.log(`[missed-dose-sweep] Configured grace period: ${graceMinutes} minutes`);

  // Step 1: Execute database state changes in an atomic transaction
  const sweepResult = await withTransaction(async (client) => {
    // Select doses where status = 'DUE' and due_date + end-of-day + grace period has passed in IST
    const res = await client.query(
      `SELECT
         d.id,
         d.course_id,
         d.seq,
         to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
         d.version,
         c.patient_id,
         c.centre_id
       FROM doses d
       JOIN courses c ON c.id = d.course_id
      WHERE d.status = 'DUE'
        AND (((d.due_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') + ($1 || ' minutes')::interval) <= CURRENT_TIMESTAMP
      ORDER BY d.due_date ASC
      FOR UPDATE OF d SKIP LOCKED`,
      [graceMinutes]
    );

    const overdueDoses = res.rows;
    if (overdueDoses.length === 0) {
      console.log('[missed-dose-sweep] No overdue doses found matching criteria.');
      return { processed: 0, doses: [] };
    }

    console.log(`[missed-dose-sweep] Found ${overdueDoses.length} overdue doses to flip to MISSED.`);

    const processedDoses: any[] = [];

    for (const dose of overdueDoses) {
      // Step A: Flip dose status to 'MISSED' with optimistic concurrency check
      const updateRes = await client.query(
        `UPDATE doses
            SET status = 'MISSED',
                version = version + 1
          WHERE id = $1 AND version = $2
          RETURNING id, course_id, seq, to_char(due_date, 'YYYY-MM-DD') AS due_date, status, version`,
        [dose.id, dose.version]
      );

      if (updateRes.rows.length === 0) {
        console.warn(`[missed-dose-sweep] Concurrency conflict updating dose ${dose.id}, skipping.`);
        continue;
      }

      // Step B: Create a 'MISSED'-kind reminder scheduled to fire immediately (now)
      const idempotencyKey = `reminder-${dose.id}-MISSED`;
      const remRes = await client.query(
        `INSERT INTO reminders (
           dose_id,
           kind,
           scheduled_for,
           status,
           idempotency_key
         )
         VALUES ($1, 'MISSED', now(), 'PENDING', $2)
         ON CONFLICT (idempotency_key) DO UPDATE
           SET status = EXCLUDED.status
         RETURNING id, dose_id, kind, scheduled_for, status, idempotency_key`,
        [dose.id, idempotencyKey]
      );

      const reminder = remRes.rows[0];

      // Step C: Insert into outbox table in the SAME atomic transaction
      await client.query(
        `INSERT INTO outbox (topic, payload)
         VALUES ($1, $2)`,
        [
          'schedule-reminder',
          JSON.stringify({
            reminderId: reminder.id,
            doseId: dose.id,
            kind: 'MISSED',
          }),
        ]
      );

      console.log(
        `[missed-dose-sweep] Dose ${dose.id} (Seq #${dose.seq}) marked MISSED; created reminder ${reminder.id} and outbox event.`
      );

      processedDoses.push({
        doseId: dose.id,
        courseId: dose.course_id,
        seq: dose.seq,
        dueDate: dose.due_date,
        reminderId: reminder.id,
      });
    }

    // Step D: Publish CloudWatch custom metric
    if (processedDoses.length > 0) {
      try {
        await cloudwatch.send(
          new PutMetricDataCommand({
            Namespace: CLOUDWATCH_NAMESPACE,
            MetricData: [
              {
                MetricName: 'DosesMarkedMissed',
                Value: processedDoses.length,
                Unit: 'Count',
                Timestamp: new Date(),
              },
            ],
          })
        );
      } catch (cwErr: any) {
        console.error('[missed-dose-sweep] Failed to emit CloudWatch metric:', cwErr.message);
      }
    }

    return {
      processed: processedDoses.length,
      doses: processedDoses,
    };
  });

  // Step 2: Post-commit Jev System One enrichment (TypeSafe AI)
  // Non-gating: Run outside transaction. Failures are caught and logged without failing the sweep.
  if (sweepResult.processed > 0) {
    try {
      const jev = await initTypeSafeClient();

      if (!jev) {
        console.warn('[missed-dose-sweep] TypeSafeClient could not be initialized (no API key). Skipping Jev enrichment.');
      } else {
        for (const dose of sweepResult.doses) {
          try {
            // Query course summary statistics for patient
            const statsRes = await query(
              `SELECT
                 c.id AS course_id,
                 c.route,
                 to_char(c.day0, 'YYYY-MM-DD') AS day0,
                 COUNT(d.id)::int AS total_doses,
                 COUNT(d.id) FILTER (WHERE d.status = 'GIVEN')::int AS doses_given,
                 COUNT(d.id) FILTER (WHERE d.status = 'MISSED')::int AS doses_missed,
                 to_char(MAX(d.due_date), 'YYYY-MM-DD') AS final_due_date,
                 MAX(d.given_at) AS last_given_at
               FROM courses c
               JOIN doses d ON d.course_id = c.id
              WHERE c.id = $1
              GROUP BY c.id, c.route, c.day0`,
              [dose.courseId]
            );

            if (statsRes.rows.length === 0) continue;
            const stats = statsRes.rows[0];

            const now = Date.now();
            const lastDoseTime = stats.last_given_at
              ? new Date(stats.last_given_at).getTime()
              : new Date(stats.day0).getTime();
            const daysSinceLast = Math.max(0, Math.floor((now - lastDoseTime) / (1000 * 60 * 60 * 24)));
            const finalDueTime = new Date(stats.final_due_date).getTime();
            const daysRemaining = Math.max(0, Math.floor((finalDueTime - now) / (1000 * 60 * 60 * 24)));

            console.log(
              `[missed-dose-sweep] Calling Jev System One for dose ${dose.doseId} (missed: ${stats.doses_missed}, given: ${stats.doses_given}, total: ${stats.total_doses})`
            );

            const result = await jev.systemOne({
              state: {
                doses_missed: stats.doses_missed,
                doses_given: stats.doses_given,
                total_doses: stats.total_doses,
                days_since_last_dose: daysSinceLast,
                route: stats.route,
                dose_sequence: dose.seq,
                days_remaining_in_course: daysRemaining,
              },
              questions: {
                escalation_level: choice(
                  'How urgently should clinic staff follow up with this patient?',
                  {
                    routine: 'Standard reminder is enough, low dropout risk',
                    priority: 'Call the patient today, significant dropout risk',
                    critical: 'Contact immediately — late in course, rabies risk is real',
                  }
                ),
                high_risk_dropout: noul(
                  'Is this patient at serious risk of not completing the course?'
                ),
              },
            });

            const escalationLevel = result.answers?.escalation_level?.choice;
            const dropoutRisk = result.answers?.high_risk_dropout?.noul;

            if (escalationLevel) {
              await query(
                `UPDATE doses
                    SET escalation_level = $1,
                        dropout_risk = $2
                  WHERE id = $3`,
                [escalationLevel, dropoutRisk !== undefined ? dropoutRisk : null, dose.doseId]
              );

              dose.escalation_level = escalationLevel;
              dose.dropout_risk = dropoutRisk;

              console.log(
                `[missed-dose-sweep] Jev enriched dose ${dose.doseId}: escalation_level=${escalationLevel}, dropout_risk=${dropoutRisk}`
              );
            }
          } catch (doseJevErr: any) {
            console.error(
              `[missed-dose-sweep] Jev evaluation failed for dose ${dose.doseId} (non-gating):`,
              doseJevErr.message || doseJevErr
            );
          }
        }
      }
    } catch (jevBatchErr: any) {
      console.error(
        '[missed-dose-sweep] Jev client execution error (non-gating):',
        jevBatchErr.message || jevBatchErr
      );
    }
  }

  return sweepResult;
};
