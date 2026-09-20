import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query, withTransaction } from '../db';
import { getCorsHeaders } from '../cors';

interface CreatePatientInput {
  name: string;
  phone_e164: string;
  language?: 'hi' | 'mr' | 'en';
  guardian_phone?: string | null;
  centre_id: string;
}

const PHONE_REGEX = /^\+[1-9][0-9]{7,14}$/;

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
    // ──────────────────────────────────────────────────────────────────────────
    // 1. GET /patients/status/{token} - Public Patient Portal
    // ──────────────────────────────────────────────────────────────────────────
    const isStatusRoute =
      httpMethod === 'GET' ||
      event.rawPath?.includes('/status/') ||
      event.rawPath?.startsWith('/patients/status') ||
      event.requestContext?.http?.path?.includes('/status/');

    if (isStatusRoute) {
      let token = event.pathParameters?.token;
      if (!token && event.rawPath) {
        const parts = event.rawPath.split('/status/');
        if (parts.length > 1) {
          token = parts[1].split('/')[0].split('?')[0];
        }
      }

      if (!token) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Status token is required in path: /patients/status/{token}' }),
        };
      }

      // Query patient and clinic details by unique status_token
      const patientRes = await query(
        `SELECT
           p.id AS patient_id,
           p.name AS patient_name,
           p.phone_e164,
           p.language AS patient_language,
           p.status_token,
           ctr.id AS centre_id,
           ctr.name AS centre_name,
           ctr.city AS centre_city,
           c.id AS course_id,
           c.protocol_id,
           proto.label AS protocol_label,
           proto.vaccine_id,
           proto.route
         FROM patients p
         JOIN centres ctr ON ctr.id = p.centre_id
         LEFT JOIN courses c ON c.patient_id = p.id
         LEFT JOIN protocols proto ON proto.id = c.protocol_id
         WHERE p.status_token = $1
         ORDER BY c.created_at DESC
         LIMIT 1`,
        [token]
      );

      if (patientRes.rows.length === 0) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: `No patient found for status token: '${token}'` }),
        };
      }

      const patient = patientRes.rows[0];

      // Query scheduled doses for this patient course
      let doses: any[] = [];
      if (patient.course_id) {
        const dosesRes = await query(
          `SELECT
             d.id,
             d.seq,
             to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
             d.status,
             d.given_at,
             d.slot_start
           FROM doses d
           WHERE d.course_id = $1
           ORDER BY d.seq ASC`,
          [patient.course_id]
        );
        doses = dosesRes.rows;
      }

      const totalDoses = doses.length || 4;
      const dosesGiven = doses.filter((d) => d.status === 'GIVEN').length;
      const nextDose = doses.find((d) => d.status === 'DUE' || d.status === 'SCHEDULED' || d.status === 'MISSED');
      const nextDueDate = nextDose ? nextDose.due_date : null;
      const nextDoseSeq = nextDose ? nextDose.seq : null;
      const firstName = patient.patient_name ? patient.patient_name.trim().split(' ')[0] : 'Patient';

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          firstName,
          fullName: patient.patient_name,
          language: patient.patient_language || 'hi',
          protocolLabel: patient.protocol_label || 'Vaccination Course',
          vaccineId: patient.vaccine_id || 'RABIES',
          dosesGiven,
          dosesTotal: totalDoses,
          nextDueDate,
          nextDoseSeq,
          centre: {
            id: patient.centre_id,
            name: patient.centre_name,
            city: patient.centre_city,
          },
          doses,
        }),
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. POST /patients - Create Patient Record
    // ──────────────────────────────────────────────────────────────────────────
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    const body: CreatePatientInput = JSON.parse(rawBody);

    const { name, phone_e164, language = 'hi', guardian_phone = null, centre_id } = body;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Patient name is required' }),
      };
    }

    if (!phone_e164 || !PHONE_REGEX.test(phone_e164)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'phone_e164 must be a valid E.164 number (e.g. +919876543210)',
        }),
      };
    }

    if (guardian_phone && !PHONE_REGEX.test(guardian_phone)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'guardian_phone must be a valid E.164 number (e.g. +919876543210)',
        }),
      };
    }

    if (!['hi', 'mr', 'en'].includes(language)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "language must be one of 'hi', 'mr', 'en'" }),
      };
    }

    if (!centre_id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'centre_id is required' }),
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

    const patientRow = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO patients (name, phone_e164, language, guardian_phone, centre_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, centre_id, name, phone_e164, language, guardian_phone, status_token, consent_at, created_at`,
        [name.trim(), phone_e164.trim(), language, guardian_phone ? guardian_phone.trim() : null, centre_id]
      );

      const patient = result.rows[0];

      if (idempotencyKey) {
        await client.query(
          `INSERT INTO idempotency_keys (key, endpoint, response)
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO NOTHING`,
          [idempotencyKey, 'POST /patients', patient]
        );
      }

      return patient;
    });

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(patientRow),
    };
  } catch (err: any) {
    console.error('Error in /patients handler:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
