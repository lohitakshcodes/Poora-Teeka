import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { query } from '../db';
import { getCorsHeaders } from '../cors';

/**
 * FHIR R4 Immunization Resource Handler
 * 
 * Endpoint: GET /fhir/Immunization/{doseId}
 * 
 * Returns a compliant HL7 FHIR Release 4 (R4) Immunization resource representation
 * of a given rabies vaccination dose. Validates data-standard interoperability
 * with the Ayushman Bharat Digital Mission (ABDM) and national immunization registries.
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const corsHeaders = {
    ...getCorsHeaders(event),
    'Content-Type': 'application/fhir+json; charset=utf-8',
  };

  const httpMethod =
    event.requestContext?.http?.method?.toUpperCase() ||
    (event as any).httpMethod?.toUpperCase() ||
    'GET';

  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const doseId = event.pathParameters?.doseId;

    if (!doseId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'required',
              diagnostics: 'Missing required path parameter: doseId',
            },
          ],
        }),
      };
    }

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
         c.id AS course_id,
         c.protocol_id,
         to_char(c.day0, 'YYYY-MM-DD') AS day0,
         c.status AS course_status,
         c.created_at AS course_created_at,
         p.id AS patient_id,
         p.name AS patient_name,
         p.phone_e164 AS patient_phone,
         p.language AS patient_language,
         pr.label AS protocol_name,
         pr.visit_offsets,
         pr.units_per_visit,
         ctr.id AS centre_id,
         ctr.name AS centre_name,
         dr.units AS reserved_units,
         dr.taken_at,
         ov.vial_serial,
         vl.brand AS vial_brand,
         to_char(vl.expiry, 'YYYY-MM-DD') AS vial_expiry
       FROM doses d
       JOIN courses c ON d.course_id = c.id
       JOIN patients p ON c.patient_id = p.id
       JOIN protocols pr ON c.protocol_id = pr.id
       JOIN centres ctr ON c.centre_id = ctr.id
       LEFT JOIN dose_reservations dr ON dr.dose_id = d.id
       LEFT JOIN open_vials ov ON dr.open_vial_id = ov.id
       LEFT JOIN vial_lots vl ON ov.lot_id = vl.id
       WHERE d.id = $1`,
      [doseId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'not-found',
              diagnostics: `Immunization resource with ID '${doseId}' not found`,
            },
          ],
        }),
      };
    }

    const row = result.rows[0];

    // Determine FHIR R4 status: 'completed' | 'entered-in-error' | 'not-done'
    let status: 'completed' | 'not-done';
    let statusReason: any = undefined;

    if (row.status === 'GIVEN') {
      status = 'completed';
    } else if (row.status === 'MISSED') {
      status = 'not-done';
      statusReason = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
            code: 'PATOBJ',
            display: 'Patient missed scheduled vaccination visit',
          },
        ],
        text: 'Patient missed scheduled anti-rabies post-exposure prophylaxis visit',
      };
    } else {
      // SCHEDULED or DUE
      status = 'not-done';
      statusReason = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
            code: 'OSTOCK',
            display: 'Scheduled / Pending administration',
          },
        ],
        text: `Vaccination dose currently ${row.status}`,
      };
    }

    const occurrenceDateTime = row.given_at
      ? new Date(row.given_at).toISOString()
      : `${row.due_date}T09:00:00+05:30`;

    const totalSeriesDoses = Array.isArray(row.visit_offsets)
      ? row.visit_offsets.length
      : 4;

    const fhirResource: Record<string, any> = {
      resourceType: 'Immunization',
      id: row.dose_id,
      meta: {
        versionId: String(row.version || 1),
        lastUpdated: new Date().toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/Immunization'],
      },
      identifier: [
        {
          system: 'https://poorateeka.org/fhir/dose-id',
          value: row.dose_id,
        },
      ],
      status,
      ...(statusReason ? { statusReason } : {}),
      vaccineCode: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '333680005',
            display: 'Rabies vaccination',
          },
          {
            system: 'http://hl7.org/fhir/sid/cvx',
            code: '18',
            display: 'Rabies, intramuscular injection',
          },
        ],
        text: row.vial_brand
          ? `Rabies vaccine (${row.vial_brand})`
          : 'Rabies post-exposure prophylaxis vaccine',
      },
      patient: {
        reference: `Patient/${row.patient_id}`,
        display: row.patient_name,
      },
      encounter: {
        reference: `Encounter/${row.course_id}`,
        display: `Anti-Rabies PEP Course (${row.protocol_name || row.protocol_id})`,
      },
      occurrenceDateTime,
      recorded: new Date(row.taken_at || row.course_created_at || row.given_at || occurrenceDateTime).toISOString(),
      primarySource: true,
      ...(row.vial_serial ? { lotNumber: row.vial_serial } : {}),
      ...(row.vial_expiry ? { expirationDate: row.vial_expiry } : {}),
      site: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '368208006',
            display: 'Left upper arm structure (deltoid)',
          },
        ],
        text: 'Deltoid muscle',
      },
      route: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration',
            code: row.route === 'ID' ? 'IDINJ' : 'IM',
            display:
              row.route === 'ID'
                ? 'Intradermal injection'
                : 'Intramuscular injection',
          },
        ],
        text: row.route === 'ID' ? 'Intradermal (ID)' : 'Intramuscular (IM)',
      },
      doseQuantity: {
        value: row.route === 'ID' ? 0.2 : 1.0,
        unit: 'mL',
        system: 'http://unitsofmeasure.org',
        code: 'mL',
      },
      location: {
        reference: `Location/${row.centre_id}`,
        display: row.centre_name,
      },
      protocolApplied: [
        {
          series: row.protocol_name || row.protocol_id,
          targetDisease: [
            {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: '14168008',
                  display: 'Rabies (disorder)',
                },
              ],
              text: 'Rabies prophylaxis',
            },
          ],
          doseNumberPositiveInt: row.seq,
          seriesDosesPositiveInt: totalSeriesDoses,
        },
      ],
    };

    if (row.escalation_level) {
      fhirResource.note = [
        {
          text: `Clinical triage: Follow-up urgency '${row.escalation_level}' with estimated dropout risk ${Math.round(
            (row.dropout_risk || 0) * 100
          )}% (triaged via TypeSafe AI Jev System One).`,
        },
      ];
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(fhirResource, null, 2),
    };
  } catch (err: any) {
    console.error('Error in GET /fhir/Immunization/{doseId}:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'fatal',
            code: 'exception',
            diagnostics: err.message || 'Internal Server Error',
          },
        ],
      }),
    };
  }
};
