import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query, withTransaction } from '../db';
import { getCorsHeaders } from '../cors';

interface CreateCourseInput {
  patientId: string;
  protocolId: string;
  day0?: string; // Optional YYYY-MM-DD, defaults to current date
  centreId?: string; // Optional, defaults to patient's centre_id
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const corsHeaders = getCorsHeaders(event);

  const httpMethod =
    event.requestContext?.http?.method?.toUpperCase() ||
    (event as any).httpMethod?.toUpperCase() ||
    'POST';

  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    const body: CreateCourseInput = JSON.parse(rawBody);

    const { patientId, protocolId, day0: rawDay0, centreId: inputCentreId } = body;

    if (!patientId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'patientId is required' }),
      };
    }

    if (!protocolId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'protocolId is required' }),
      };
    }

    if (rawDay0 && !DATE_REGEX.test(rawDay0)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'day0 must be in YYYY-MM-DD format' }),
      };
    }

    // Check Idempotency-Key
    const idempotencyKey =
      event.headers['idempotency-key'] || event.headers['Idempotency-Key'];

    if (idempotencyKey) {
      const existing = await query(
        'SELECT response FROM idempotency_keys WHERE key = $1',
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'X-Cache': 'IDEMPOTENT' },
          body: JSON.stringify(existing.rows[0].response),
        };
      }
    }

    // Core transaction: Read protocol, insert course, generate doses
    const resultData = await withTransaction(async (client) => {
      // 1. Read protocol
      const protocolRes = await client.query(
        `SELECT id, label, route, visit_offsets, units_per_visit
         FROM protocols
         WHERE id = $1`,
        [protocolId]
      );

      if (protocolRes.rows.length === 0) {
        throw { statusCode: 404, message: `Protocol not found: '${protocolId}'` };
      }

      const protocol = protocolRes.rows[0];
      const { route, visit_offsets } = protocol;

      // 2. Read patient to resolve centre_id
      const patientRes = await client.query(
        `SELECT id, centre_id FROM patients WHERE id = $1`,
        [patientId]
      );

      if (patientRes.rows.length === 0) {
        throw { statusCode: 404, message: `Patient not found: '${patientId}'` };
      }

      const centreId = inputCentreId || patientRes.rows[0].centre_id;

      // Determine day0 date (defaults to current date in IST)
      const day0Date =
        rawDay0 ||
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      // 3. Insert into courses (route taken directly from protocol, never client-specified)
      const courseRes = await client.query(
        `INSERT INTO courses (patient_id, centre_id, protocol_id, route, day0, status)
         VALUES ($1, $2, $3, $4, $5::date, 'ACTIVE')
         RETURNING id, patient_id, centre_id, protocol_id, route, to_char(day0, 'YYYY-MM-DD') AS day0, status, created_at`,
        [patientId, centreId, protocolId, route, day0Date]
      );

      const course = courseRes.rows[0];

      // 4. Insert one row per offset into doses:
      // due_date = day0 + offset days
      // offset 0 is marked 'DUE', subsequent offsets are marked 'SCHEDULED'
      const doses: any[] = [];
      const reminders: any[] = [];
      const offsets: number[] = visit_offsets;

      for (let i = 0; i < offsets.length; i++) {
        const offset = offsets[i];
        const seq = i + 1;
        const status = offset === 0 ? 'DUE' : 'SCHEDULED';

        const doseRes = await client.query(
          `INSERT INTO doses (course_id, route, seq, due_date, status)
           VALUES ($1, $2, $3, ($4::date + ($5 || ' days')::interval)::date, $6)
           RETURNING id, course_id, route, seq, to_char(due_date, 'YYYY-MM-DD') AS due_date, status, given_at, slot_start, version`,
          [course.id, route, seq, day0Date, offset, status]
        );

        const dose = doseRes.rows[0];
        doses.push(dose);

        // For doses after the first (seq > 1), create a PRE reminder 1 day before due_date,
        // and insert an outbox event in the same transaction.
        if (i > 0) {
          const reminderKey = `reminder-${dose.id}-PRE`;
          const remRes = await client.query(
            `INSERT INTO reminders (dose_id, kind, scheduled_for, status, idempotency_key)
             VALUES (
               $1,
               'PRE',
               ($2::date - interval '1 day' + time '09:00') AT TIME ZONE 'Asia/Kolkata',
               'PENDING',
               $3
             )
             RETURNING id, dose_id, kind, scheduled_for, status, idempotency_key`,
            [dose.id, dose.due_date, reminderKey]
          );
          const reminder = remRes.rows[0];
          reminders.push(reminder);

          // Outbox event to trigger async scheduling
          await client.query(
            `INSERT INTO outbox (topic, payload)
             VALUES ($1, $2)`,
            ['schedule-reminder', JSON.stringify({ reminderId: reminder.id, doseId: dose.id })]
          );
        }
      }

      const payload = {
        course,
        doses,
        reminders,
      };

      if (idempotencyKey) {
        await client.query(
          `INSERT INTO idempotency_keys (key, endpoint, response)
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO NOTHING`,
          [idempotencyKey, 'POST /courses', payload]
        );
      }

      return payload;
    });

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(resultData),
    };
  } catch (err: any) {
    console.error('Error in POST /courses:', err);
    const statusCode = err.statusCode || 500;
    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
