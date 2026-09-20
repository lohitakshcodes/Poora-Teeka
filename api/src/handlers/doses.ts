import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query } from '../db';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const centreId = event.queryStringParameters?.centreId;

    if (!centreId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required query parameter: centreId' }),
      };
    }

    // Detect route: /doses/missed vs /doses/today
    const isMissedRoute =
      event.rawPath === '/doses/missed' ||
      event.rawPath?.endsWith('/missed') ||
      event.requestContext?.http?.path === '/doses/missed' ||
      event.requestContext?.http?.path?.endsWith('/missed');

    if (isMissedRoute) {
      const result = await query(
        `SELECT
           d.id AS dose_id,
           d.course_id,
           d.route,
           d.seq,
           to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
           d.status,
           d.given_at,
           d.slot_start,
           d.escalation_level,
           d.dropout_risk,
           d.version,
           c.protocol_id,
           to_char(c.day0, 'YYYY-MM-DD') AS day0,
           c.centre_id,
           p.id AS patient_id,
           p.name AS patient_name,
           p.phone_e164 AS patient_phone,
           p.language AS patient_language,
           p.guardian_phone AS patient_guardian_phone
         FROM doses d
         JOIN courses c ON d.course_id = c.id
         JOIN patients p ON c.patient_id = p.id
         WHERE c.centre_id = $1
           AND d.status = 'MISSED'
         ORDER BY d.due_date DESC, d.seq ASC, p.name ASC`,
        [centreId]
      );

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          centre_id: centreId,
          count: result.rows.length,
          doses: result.rows,
        }),
      };
    }

    // Default: /doses/today
    // Optional date override (defaults to CURRENT_DATE)
    const targetDate = event.queryStringParameters?.date;

    const result = await query(
      `SELECT
         d.id AS dose_id,
         d.course_id,
         d.route,
         d.seq,
         to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
         d.status,
         d.given_at,
         d.slot_start,
         d.version,
         c.protocol_id,
         to_char(c.day0, 'YYYY-MM-DD') AS day0,
         c.centre_id,
         p.id AS patient_id,
         p.name AS patient_name,
         p.phone_e164 AS patient_phone,
         p.language AS patient_language,
         p.guardian_phone AS patient_guardian_phone
       FROM doses d
       JOIN courses c ON d.course_id = c.id
       JOIN patients p ON c.patient_id = p.id
       WHERE c.centre_id = $1
         AND d.due_date = COALESCE($2::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
       ORDER BY d.seq ASC, p.name ASC`,
      [centreId, targetDate || null]
    );

    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centre_id: centreId,
        date: targetDate || todayIST,
        count: result.rows.length,
        doses: result.rows,
      }),
    };
  } catch (err: any) {
    console.error('Error in GET /doses:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
