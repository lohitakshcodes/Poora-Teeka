import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query, withTransaction } from '../db';

interface CentreRow {
  id: string;
  name: string;
  city: string;
  day_start: string;
  day_end: string;
  open_vial_minutes: number;
}

interface DosePatientRow {
  dose_id: string;
  dose_seq: number;
  due_date: string;
  dose_status: string;
  route: string;
  slot_start: string | null;
  version: number;
  course_id: string;
  protocol_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  guardian_phone: string | null;
  patient_language: string;
  units_per_visit: number;
  is_minor: boolean;
}

interface TimeSlot {
  slotIndex: number;
  startTime: string; // "09:00"
  endTime: string;   // "09:30"
  slotStartIso: string; // ISO string with IST offset
}

interface PatientGroup {
  groupNumber: number;
  slotIndex: number;
  startTime: string;
  endTime: string;
  slotStartIso: string;
  vialVirtualId: string;
  vialCapacityUnits: number;
  plannedUnits: number;
  walkInReservedUnits: number;
  walkInReservedSlots: number;
  totalAllocatedUnits: number;
  patients: Array<{
    doseId: string;
    courseId: string;
    patientId: string;
    patientName: string;
    patientPhone: string;
    guardianPhone: string | null;
    isMinor: boolean;
    doseSeq: number;
    units: number;
    currentSlotStart: string | null;
  }>;
}

function getTomorrowIST(dateOverride?: string): string {
  if (dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    return dateOverride;
  }
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const tomorrow = new Date(istNow.getTime() + 24 * 60 * 60 * 1000);
  const year = tomorrow.getUTCFullYear();
  const month = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function formatMinutesToTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function generateSlots(dayStart: string, dayEnd: string, targetDate: string): TimeSlot[] {
  const startMins = parseTimeToMinutes(dayStart || '09:00');
  const endMins = parseTimeToMinutes(dayEnd || '17:00');
  const slotDuration = 30; // 30-minute windows

  const slots: TimeSlot[] = [];
  let currentMins = startMins;
  let index = 0;

  while (currentMins + slotDuration <= endMins) {
    const startTime = formatMinutesToTime(currentMins);
    const endTime = formatMinutesToTime(currentMins + slotDuration);
    // Construct ISO string in Asia/Kolkata (+05:30)
    const slotStartIso = `${targetDate}T${startTime}:00+05:30`;

    slots.push({
      slotIndex: index,
      startTime,
      endTime,
      slotStartIso,
    });

    currentMins += slotDuration;
    index++;
  }

  return slots;
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

    const dateParam = event.queryStringParameters?.date;
    const shouldConfirm =
      event.queryStringParameters?.confirm === 'true' ||
      event.queryStringParameters?.confirm === '1';

    const targetDate = getTomorrowIST(dateParam);

    // 1. Resolve centre details and operating hours
    const centreRes = await query<CentreRow>(
      `SELECT id, name, city, day_start::text, day_end::text, open_vial_minutes
         FROM centres
        WHERE id = $1`,
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

    // 2. Generate 30-minute slots across centre operating hours
    const slots = generateSlots(centre.day_start, centre.day_end, targetDate);
    if (slots.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          error: `Invalid operating hours for centre: ${centre.day_start} to ${centre.day_end}`,
        }),
      };
    }

    // 3. Resolve vial capacity
    const lotRes = await query(
      `SELECT units_per_vial
         FROM vial_lots
        WHERE centre_id = $1 AND remaining_unopened > 0
        ORDER BY expiry ASC
        LIMIT 1`,
      [centreId]
    );
    const vialCapacityUnits = lotRes.rows[0]?.units_per_vial || 10; // Standard 1.0 ml anti-rabies vial = 10 units

    // 4. Query tomorrow's due ID doses for the centre
    // Prioritization: Minors first (guardian_phone IS NOT NULL), then earliest sequence (seq ASC)
    const dosesRes = await query<DosePatientRow>(
      `SELECT
         d.id AS dose_id,
         d.seq AS dose_seq,
         to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
         d.status AS dose_status,
         d.route,
         d.slot_start::text,
         d.version,
         c.id AS course_id,
         c.protocol_id,
         p.id AS patient_id,
         p.name AS patient_name,
         p.phone_e164 AS patient_phone,
         p.guardian_phone,
         p.language AS patient_language,
         pr.units_per_visit,
         (p.guardian_phone IS NOT NULL) AS is_minor
       FROM doses d
       JOIN courses c ON c.id = d.course_id
       JOIN patients p ON p.id = c.patient_id
       JOIN protocols pr ON pr.id = c.protocol_id
      WHERE c.centre_id = $1
        AND d.route = 'ID'
        AND d.due_date = $2::date
        AND d.status IN ('SCHEDULED', 'DUE')
      ORDER BY
        (p.guardian_phone IS NOT NULL) DESC, -- Minors first
        d.seq ASC,                           -- Earliest dose sequence
        p.name ASC,                          -- Secondary stable sort
        d.id ASC`,
      [centreId, targetDate]
    );

    const patients = dosesRes.rows;
    const totalPatients = patients.length;

    // 5. Vial-Batching Algorithm with 20% Walk-in Reserve
    // Each ID visit consumes units_per_visit (Thai Red Cross ID = 2 units)
    const unitsPerVisit = patients[0]?.units_per_visit || 2;

    // 20% capacity reserved for unplanned emergency walk-ins
    const walkInReservedUnits = Math.round(vialCapacityUnits * 0.2); // e.g. 2 units
    const walkInReservedSlots = Math.floor(walkInReservedUnits / unitsPerVisit); // e.g. 1 patient visit

    // Usable capacity for pre-scheduled patients
    const plannedUnitsPerVial = vialCapacityUnits - walkInReservedUnits; // e.g. 8 units
    const maxPlannedPatientsPerVial = Math.max(1, Math.floor(plannedUnitsPerVial / unitsPerVisit)); // e.g. 4 patients

    const groups: PatientGroup[] = [];
    let patientIndex = 0;
    let slotIndex = 0;

    while (patientIndex < totalPatients && slotIndex < slots.length) {
      const slot = slots[slotIndex];
      const groupPatients = patients.slice(patientIndex, patientIndex + maxPlannedPatientsPerVial);
      patientIndex += groupPatients.length;

      const groupNumber = groups.length + 1;
      const plannedUnits = groupPatients.length * unitsPerVisit;

      groups.push({
        groupNumber,
        slotIndex: slot.slotIndex,
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotStartIso: slot.slotStartIso,
        vialVirtualId: `VIAL-BATCH-${groupNumber}`,
        vialCapacityUnits,
        plannedUnits,
        walkInReservedUnits,
        walkInReservedSlots,
        totalAllocatedUnits: plannedUnits + walkInReservedUnits,
        patients: groupPatients.map((p) => ({
          doseId: p.dose_id,
          courseId: p.course_id,
          patientId: p.patient_id,
          patientName: p.patient_name,
          patientPhone: p.patient_phone,
          guardianPhone: p.guardian_phone,
          isMinor: p.is_minor,
          doseSeq: p.dose_seq,
          units: unitsPerVisit,
          currentSlotStart: p.slot_start,
        })),
      });

      slotIndex++;
    }

    // 6. Honest Comparison Metrics
    // Naive baseline: in an uncoordinated clinic, patients arrive at random times,
    // requiring 1 new opened vial per patient.
    const vialsNeededBatched = groups.length;
    const vialsNeededNaive = totalPatients;
    const vialsSaved = Math.max(0, vialsNeededNaive - vialsNeededBatched);
    const savingsPercentage =
      totalPatients > 0 ? Math.round((vialsSaved / vialsNeededNaive) * 100) : 0;

    // 7. If confirm=true, write suggested slot_start onto each dose in a single transaction
    let confirmedDosesCount = 0;
    if (shouldConfirm && groups.length > 0) {
      await withTransaction(async (client) => {
        for (const group of groups) {
          for (const pt of group.patients) {
            const updateRes = await client.query(
              `UPDATE doses
                  SET slot_start = $1
                WHERE id = $2
                RETURNING id`,
              [group.slotStartIso, pt.doseId]
            );
            if (updateRes.rows.length > 0) {
              confirmedDosesCount++;
            }
          }
        }
      });
      console.log(
        `[plan] Confirmed and wrote slot_start for ${confirmedDosesCount} doses on date ${targetDate}`
      );
    }

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
          dayStart: centre.day_start,
          dayEnd: centre.day_end,
          totalSlotsAvailable: slots.length,
        },
        date: targetDate,
        summary: {
          totalScheduledPatients: totalPatients,
          minorsCount: patients.filter((p) => p.is_minor).length,
          vialsNeeded: vialsNeededBatched,
          vialsNeededNaive: vialsNeededNaive,
          vialsSaved,
          savingsPercentage,
          vialCapacityUnits,
          unitsPerVisit,
          walkInReservePercentage: 20,
          walkInReservedUnitsPerGroup: walkInReservedUnits,
          maxPlannedPatientsPerGroup: maxPlannedPatientsPerVial,
          comparisonText: `Vials needed: ${vialsNeededBatched} (naive: ${vialsNeededNaive})`,
        },
        confirmed: shouldConfirm,
        confirmedDosesCount,
        groupsCount: groups.length,
        groups,
      }),
    };
  } catch (err: any) {
    console.error('[plan] Error generating batching plan:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
