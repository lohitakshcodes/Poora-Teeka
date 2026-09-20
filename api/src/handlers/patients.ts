import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query, withTransaction } from '../db';

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
  try {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Patient name is required' }),
      };
    }

    if (!phone_e164 || !PHONE_REGEX.test(phone_e164)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'phone_e164 must be a valid E.164 number (e.g. +919876543210)',
        }),
      };
    }

    if (guardian_phone && !PHONE_REGEX.test(guardian_phone)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'guardian_phone must be a valid E.164 number (e.g. +919876543210)',
        }),
      };
    }

    if (!['hi', 'mr', 'en'].includes(language)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: "language must be one of 'hi', 'mr', 'en'" }),
      };
    }

    if (!centre_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'IDEMPOTENT' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientRow),
    };
  } catch (err: any) {
    console.error('Error in POST /patients:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
