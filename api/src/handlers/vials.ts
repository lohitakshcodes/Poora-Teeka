import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query, withTransaction } from '../db';

interface OpenVialInput {
  lotId: string;
  centreId?: string;
  vialSerial?: string;
}

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
    const body: OpenVialInput = JSON.parse(rawBody);

    const { lotId, centreId: inputCentreId, vialSerial: inputSerial } = body;

    if (!lotId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'lotId is required' }),
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

    const newVial = await withTransaction(async (client) => {
      // 1. Lock and verify lot has remaining unopened vials
      const lotRes = await client.query(
        `SELECT id, centre_id, brand, units_per_vial, remaining_unopened
         FROM vial_lots
         WHERE id = $1
         FOR UPDATE`,
        [lotId]
      );

      if (lotRes.rows.length === 0) {
        throw { statusCode: 404, message: `Vial lot not found: '${lotId}'` };
      }

      const lot = lotRes.rows[0];
      if (lot.remaining_unopened <= 0) {
        throw { statusCode: 400, message: `No unopened vials remaining in lot '${lotId}'` };
      }

      const centreId = inputCentreId || lot.centre_id;
      const serial =
        inputSerial ||
        `${lot.brand.replace(/\s+/g, '-').toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.floor(
          Math.random() * 10000
        )}`;

      // 2. Call open_vial PL/pgSQL function to atomically decrement lot and insert open_vial
      const openRes = await client.query(
        `SELECT open_vial($1, $2, $3) AS vial_id`,
        [centreId, lotId, serial]
      );

      const vialId = openRes.rows[0].vial_id;

      // 3. Return newly created open_vials row
      const vialRowRes = await client.query(
        `SELECT
           id,
           centre_id,
           lot_id,
           vial_serial,
           opened_at,
           lower(usable) AS usable_start,
           upper(usable) AS usable_end,
           units_total,
           units_used
         FROM open_vials
         WHERE id = $1`,
        [vialId]
      );

      const vialRow = vialRowRes.rows[0];

      if (idempotencyKey) {
        await client.query(
          `INSERT INTO idempotency_keys (key, endpoint, response)
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO NOTHING`,
          [idempotencyKey, 'POST /vials/open', vialRow]
        );
      }

      return vialRow;
    });

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newVial),
    };
  } catch (err: any) {
    console.error('Error in POST /vials/open:', err);
    const statusCode = err.statusCode || 500;
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
