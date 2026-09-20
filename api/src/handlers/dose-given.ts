import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query, withTransaction } from '../db';

interface DoseGivenInput {
  version: number;
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const doseId = event.pathParameters?.id;
    if (!doseId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Dose ID is required in path (/doses/{id}/given)' }),
      };
    }

    // Require and honor Idempotency-Key header
    const idempotencyKey =
      event.headers['idempotency-key'] || event.headers['Idempotency-Key'];

    if (!idempotencyKey) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Idempotency-Key header is required for this operation' }),
      };
    }

    // Check cached idempotent response
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

    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body with required version field is required' }),
      };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    const body: DoseGivenInput = JSON.parse(rawBody);

    if (typeof body.version !== 'number') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Field "version" (integer) is required for optimistic locking' }),
      };
    }

    const result = await withTransaction(async (client) => {
      // 1. Lock dose row and fetch protocol/course information
      const doseRes = await client.query(
        `SELECT
           d.id,
           d.course_id,
           d.route,
           d.seq,
           to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
           d.status,
           d.given_at,
           d.version,
           c.centre_id,
           c.protocol_id,
           p.units_per_visit
         FROM doses d
         JOIN courses c ON d.course_id = c.id
         JOIN protocols p ON c.protocol_id = p.id
         WHERE d.id = $1
         FOR UPDATE`,
        [doseId]
      );

      if (doseRes.rows.length === 0) {
        throw { statusCode: 404, message: `Dose not found: '${doseId}'` };
      }

      const dose = doseRes.rows[0];

      // Optimistic locking check: version must match exactly
      if (dose.version !== body.version) {
        throw {
          statusCode: 409,
          message: `Optimistic locking conflict: dose version mismatch. Expected version ${dose.version}, got ${body.version}`,
        };
      }

      if (dose.status === 'GIVEN') {
        throw { statusCode: 409, message: `Dose '${doseId}' is already marked GIVEN` };
      }

      const unitsToReserve: number = dose.units_per_visit;
      const centreId: string = dose.centre_id;

      // 2. Reserve units from an existing live vial using reserve_units()
      // (reserve_units uses FOR UPDATE SKIP LOCKED to prevent concurrency contention)
      let reserveRes = await client.query(
        `SELECT reserve_units($1, $2, $3) AS vial_id`,
        [doseId, centreId, unitsToReserve]
      );

      let allocatedVialId = reserveRes.rows[0].vial_id;

      // If NULL, no open vial has enough remaining capacity:
      // Coordinate vial opening by locking vial_lots FOR UPDATE (serialized per lot)
      if (!allocatedVialId) {
        const lotRes = await client.query(
          `SELECT id, brand, units_per_vial, remaining_unopened
           FROM vial_lots
           WHERE centre_id = $1
             AND remaining_unopened > 0
             AND units_per_vial >= $2
             AND expiry >= CURRENT_DATE
           ORDER BY expiry ASC
           FOR UPDATE
           LIMIT 1`,
          [centreId, unitsToReserve]
        );

        if (lotRes.rows.length === 0) {
          throw {
            statusCode: 409,
            message: `No live open vial has sufficient capacity (${unitsToReserve} units required) and no unopened vial lots are available at centre.`,
          };
        }

        const lot = lotRes.rows[0];

        // Double-check: another concurrent transaction may have opened a fresh vial while we were waiting on the lock
        reserveRes = await client.query(
          `SELECT reserve_units($1, $2, $3) AS vial_id`,
          [doseId, centreId, unitsToReserve]
        );
        allocatedVialId = reserveRes.rows[0].vial_id;

        // If still no capacity in any open vial, open a new vial from this lot
        if (!allocatedVialId) {
          const newSerial = `${lot.brand.replace(/\s+/g, '-').toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.floor(
            Math.random() * 10000
          )}`;

          // Open new vial
          await client.query(
            `SELECT open_vial($1, $2, $3)`,
            [centreId, lot.id, newSerial]
          );

          // Reserve units from the newly opened vial
          reserveRes = await client.query(
            `SELECT reserve_units($1, $2, $3) AS vial_id`,
            [doseId, centreId, unitsToReserve]
          );

          allocatedVialId = reserveRes.rows[0].vial_id;

          if (!allocatedVialId) {
            throw {
              statusCode: 500,
              message: `Failed to reserve units after opening new vial from lot '${lot.id}'.`,
            };
          }
        }
      }

      // 3. Mark the dose GIVEN, bump version, and retrieve reservation in a single roundtrip
      const finishRes = await client.query(
        `WITH upd AS (
           UPDATE doses
              SET status = 'GIVEN',
                  given_at = now(),
                  version = version + 1
            WHERE id = $1
            RETURNING id, course_id, route, seq, to_char(due_date, 'YYYY-MM-DD') AS due_date, status, given_at, version
         ),
         resv AS (
           SELECT
             dr.id AS reservation_id,
             dr.open_vial_id,
             dr.units,
             dr.taken_at,
             ov.vial_serial,
             ov.units_total,
             ov.units_used
           FROM dose_reservations dr
           JOIN open_vials ov ON dr.open_vial_id = ov.id
           WHERE dr.dose_id = $1
         )
         SELECT
           to_jsonb(upd.*) AS dose,
           to_jsonb(resv.*) AS reservation
         FROM upd, resv`,
        [doseId]
      );

      const responsePayload = finishRes.rows[0];

      // 4. Store in idempotency_keys
      await client.query(
        `INSERT INTO idempotency_keys (key, endpoint, response)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [idempotencyKey, `POST /doses/${doseId}/given`, responsePayload]
      );

      return responsePayload;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error('Error in POST /doses/{id}/given:', err);
    const statusCode = err.statusCode || 500;
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
