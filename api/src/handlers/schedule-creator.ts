import type { SQSEvent } from 'aws-lambda';
import { SchedulerClient, CreateScheduleCommand } from '@aws-sdk/client-scheduler';
import { query } from '../db';

const scheduler = new SchedulerClient({});
const WORKER_LAMBDA_ARN = process.env.WORKER_LAMBDA_ARN;
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN;

function formatToIST(date: Date): string {
  // Asia/Kolkata is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export const handler = async (event: SQSEvent): Promise<{ processed: number; errors: number }> => {
  if (!WORKER_LAMBDA_ARN) {
    throw new Error('WORKER_LAMBDA_ARN environment variable is not set');
  }
  if (!SCHEDULER_ROLE_ARN) {
    throw new Error('SCHEDULER_ROLE_ARN environment variable is not set');
  }

  let processed = 0;
  let errors = 0;

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const payload = body.payload || {};
      const reminderId = payload.reminderId || payload.reminder_id;

      if (!reminderId) {
        console.warn('[schedule-creator] Record missing reminderId, skipping:', record.body);
        continue;
      }

      // 1. Load reminder from DB
      const remRes = await query(
        `SELECT r.id, r.dose_id, r.kind, r.scheduled_for, r.schedule_name, r.status
           FROM reminders r
          WHERE r.id = $1`,
        [reminderId]
      );

      if (remRes.rows.length === 0) {
        console.warn(`[schedule-creator] Reminder ${reminderId} not found in DB`);
        continue;
      }

      const reminder = remRes.rows[0];

      // If already scheduled, skip (idempotent)
      if (reminder.schedule_name) {
        console.log(`[schedule-creator] Reminder ${reminderId} already has schedule: ${reminder.schedule_name}`);
        processed++;
        continue;
      }

      const scheduleName = `pt-rem-${reminder.id}`;
      const scheduledForDate = new Date(reminder.scheduled_for);

      // Ensure execution time is at least 60 seconds in the future.
      // EventBridge Scheduler requires one-time 'at(...)' schedules to be in the future,
      // which allows MISSED reminders (scheduled_for = now()) to fire immediately within ~60s.
      const now = new Date();
      const minFutureTime = new Date(now.getTime() + 60 * 1000);
      const targetDate =
        scheduledForDate.getTime() < minFutureTime.getTime() ? minFutureTime : scheduledForDate;
      const istExpression = `at(${formatToIST(targetDate)})`;

      console.log(
        `[schedule-creator] Creating one-time schedule: ${scheduleName} at ${istExpression} (Asia/Kolkata)`
      );

      try {
        await scheduler.send(
          new CreateScheduleCommand({
            Name: scheduleName,
            ScheduleExpression: istExpression,
            ScheduleExpressionTimezone: 'Asia/Kolkata',
            FlexibleTimeWindow: { Mode: 'OFF' },
            ActionAfterCompletion: 'NONE',
            Target: {
              Arn: WORKER_LAMBDA_ARN,
              RoleArn: SCHEDULER_ROLE_ARN,
              Input: JSON.stringify({
                reminderId: reminder.id,
                doseId: reminder.dose_id,
                kind: reminder.kind,
              }),
            },
          })
        );
      } catch (schedErr: any) {
        // If conflict (already created in previous retry), proceed to record schedule_name
        if (schedErr.name === 'ConflictException') {
          console.warn(`[schedule-creator] Schedule ${scheduleName} already exists in EventBridge Scheduler`);
        } else {
          throw schedErr;
        }
      }

      // 2. Write schedule name back to reminders table
      await query(
        `UPDATE reminders
            SET schedule_name = $1
          WHERE id = $2`,
        [scheduleName, reminder.id]
      );

      console.log(`[schedule-creator] Successfully associated schedule ${scheduleName} with reminder ${reminder.id}`);
      processed++;
    } catch (err: any) {
      console.error('[schedule-creator] Error processing SQS record:', err);
      errors++;
      throw err; // Re-throw so SQS retries and eventually sends to DLQ if persistent
    }
  }

  return { processed, errors };
};
