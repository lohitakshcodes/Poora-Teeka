import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query } from '../db';

interface FunnelRow {
  seq: number;
  total_count: string;
  given_count: string;
  due_count: string;
  missed_count: string;
  scheduled_count: string;
}

interface OpenVialRow {
  units_total: number;
  units_used: number;
  ml: string;
  units_per_vial: number;
  is_expired: boolean;
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const centreId = event.queryStringParameters?.centreId;
    if (!centreId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required query parameter: centreId' }),
      };
    }

    // 1. Resolve Centre
    const centreRes = await query(
      `SELECT id, name, city, day_start::text, day_end::text FROM centres WHERE id = $1`,
      [centreId]
    );
    if (centreRes.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Centre not found: ${centreId}` }),
      };
    }
    const centre = centreRes.rows[0];

    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // 2. Completion Funnel per Dose Sequence (GIVEN vs scheduled/due/missed)
    const funnelRes = await query<FunnelRow>(
      `SELECT
         d.seq,
         COUNT(*)::text AS total_count,
         COUNT(*) FILTER (WHERE d.status = 'GIVEN')::text AS given_count,
         COUNT(*) FILTER (WHERE d.status = 'DUE')::text AS due_count,
         COUNT(*) FILTER (WHERE d.status = 'MISSED')::text AS missed_count,
         COUNT(*) FILTER (WHERE d.status = 'SCHEDULED')::text AS scheduled_count
       FROM doses d
       JOIN courses c ON c.id = d.course_id
      WHERE c.centre_id = $1
      GROUP BY d.seq
      ORDER BY d.seq ASC`,
      [centreId]
    );

    const funnel = funnelRes.rows.map((row) => {
      const total = parseInt(row.total_count, 10) || 0;
      const given = parseInt(row.given_count, 10) || 0;
      const due = parseInt(row.due_count, 10) || 0;
      const missed = parseInt(row.missed_count, 10) || 0;
      const scheduled = parseInt(row.scheduled_count, 10) || 0;
      const completionRatePct = total > 0 ? Math.round((given / total) * 100) : 0;

      return {
        seq: row.seq,
        label: `Dose #${row.seq}`,
        total,
        given,
        due,
        missed,
        scheduled,
        completionRatePct,
      };
    });

    // 3. Vials Opened Today vs Theoretical Minimum & ml Discarded Today
    // A. Query total ID units consumed today in IST
    const unitsRes = await query(
      `SELECT COALESCE(SUM(dr.units), 0)::int AS total_id_units_used
         FROM dose_reservations dr
         JOIN doses d ON d.id = dr.dose_id
         JOIN courses c ON c.id = d.course_id
        WHERE c.centre_id = $1
          AND d.route = 'ID'
          AND (dr.taken_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
      [centreId, todayIST]
    );
    const totalIdUnitsUsedToday = unitsRes.rows[0]?.total_id_units_used || 0;

    // B. Query vials opened today and compute wastage from expired vials
    const vialsRes = await query<OpenVialRow>(
      `SELECT
         ov.units_total,
         ov.units_used,
         vl.ml::text,
         vl.units_per_vial,
         (upper(ov.usable) <= CURRENT_TIMESTAMP) AS is_expired
       FROM open_vials ov
       JOIN vial_lots vl ON vl.id = ov.lot_id
      WHERE ov.centre_id = $1
        AND (ov.opened_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
      [centreId, todayIST]
    );

    const vialsOpenedToday = vialsRes.rows.length;
    const unitsPerVial = vialsRes.rows[0]?.units_per_vial || 10; // default 10 units for 1.0ml vial

    // Theoretical minimum = total ID units used ÷ units per vial, rounded up
    const theoreticalMinVials =
      totalIdUnitsUsedToday > 0 ? Math.ceil(totalIdUnitsUsedToday / unitsPerVial) : 0;

    // ml discarded today: from expired open vials opened today, leftover units * (ml / units_per_vial)
    let mlDiscardedToday = 0;
    let unitsDiscardedToday = 0;

    for (const vial of vialsRes.rows) {
      if (vial.is_expired) {
        const unusedUnits = Math.max(0, vial.units_total - vial.units_used);
        const mlTotal = parseFloat(vial.ml) || 1.0;
        const mlPerUnit = mlTotal / vial.units_per_vial;
        unitsDiscardedToday += unusedUnits;
        mlDiscardedToday += unusedUnits * mlPerUnit;
      }
    }
    mlDiscardedToday = Math.round(mlDiscardedToday * 100) / 100; // 2 decimal places

    const vialEfficiencyPct =
      vialsOpenedToday > 0 ? Math.round((theoreticalMinVials / vialsOpenedToday) * 100) : 100;

    // 4. Reminder Delivery Rate
    const remindersRes = await query(
      `SELECT
         COUNT(*)::int AS total_reminders,
         COUNT(*) FILTER (WHERE r.status = 'SENT')::int AS sent_count,
         COUNT(*) FILTER (WHERE r.status = 'FAILED')::int AS failed_count,
         COUNT(*) FILTER (WHERE r.status = 'PENDING')::int AS pending_count,
         COUNT(*) FILTER (WHERE r.kind = 'PRE')::int AS pre_count,
         COUNT(*) FILTER (WHERE r.kind = 'MISSED')::int AS missed_count
       FROM reminders r
       JOIN doses d ON d.id = r.dose_id
       JOIN courses c ON c.id = d.course_id
      WHERE c.centre_id = $1`,
      [centreId]
    );

    const remStats = remindersRes.rows[0] || {
      total_reminders: 0,
      sent_count: 0,
      failed_count: 0,
      pending_count: 0,
      pre_count: 0,
      missed_count: 0,
    };

    const totalProcessedReminders = remStats.sent_count + remStats.failed_count;
    const deliveryRatePct =
      totalProcessedReminders > 0
        ? Math.round((remStats.sent_count / totalProcessedReminders) * 100)
        : remStats.sent_count > 0
        ? 100
        : 0;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify({
        centre: {
          id: centre.id,
          name: centre.name,
          city: centre.city,
        },
        date: todayIST,
        completionFunnel: {
          sequences: funnel,
          totalCoursesTracked: funnel[0]?.total || 0,
        },
        vialsToday: {
          vialsOpenedToday,
          totalIdUnitsUsedToday,
          unitsPerVial,
          theoreticalMinVials,
          vialEfficiencyPct,
          unitsDiscardedToday,
          mlDiscardedToday,
          comparisonText: `Vials opened: ${vialsOpenedToday} vs theoretical minimum: ${theoreticalMinVials}`,
        },
        reminderDelivery: {
          totalReminders: remStats.total_reminders,
          sentReminders: remStats.sent_count,
          failedReminders: remStats.failed_count,
          pendingReminders: remStats.pending_count,
          preReminders: remStats.pre_count,
          missedAlerts: remStats.missed_count,
          deliveryRatePct,
        },
      }),
    };
  } catch (err: any) {
    console.error('[metrics] Error computing metrics:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
