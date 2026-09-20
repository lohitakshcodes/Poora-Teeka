import { ApiError } from './errors';
import type {
  Course,
  CreateCourseRequest,
  CreatePatientRequest,
  Dose,
  GivenDoseResponse,
  MetricsResponse,
  MissedDosesResponse,
  Patient,
  TodayDosesResponse,
  TomorrowPlanResponse,
  Vial,
  VialsResponse,
} from './types';

// Helper to calculate date offsets in YYYY-MM-DD format safely
function addDaysToDateStr(baseDateStr: string, days: number): string {
  // Support YYYY-MM-DD or ISO strings
  const cleanDateStr = baseDateStr.includes('T') ? baseDateStr.split('T')[0] : baseDateStr;
  const parts = cleanDateStr.split('-').map(Number);
  const year = parts[0] || new Date().getUTCFullYear();
  const month = parts[1] ? parts[1] - 1 : new Date().getUTCMonth();
  const day = parts[2] || new Date().getUTCDate();

  const d = new Date(Date.UTC(year, month, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getTodayDateStr(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getTomorrowDateStr(): string {
  return addDaysToDateStr(getTodayDateStr(), 1);
}

export function handleMockRequest<T>(path: string, options?: RequestInit): T {
  const [pathname] = path.split('?');
  const method = (options?.method || 'GET').toUpperCase();

  let body: Record<string, unknown> = {};
  if (options?.body) {
    if (typeof options.body === 'string') {
      try {
        body = JSON.parse(options.body);
      } catch {
        body = {};
      }
    } else if (typeof options.body === 'object' && options.body !== null) {
      body = options.body as unknown as Record<string, unknown>;
    }
  }

  // 1. GET /doses/today?centreId=
  if (method === 'GET' && pathname === '/doses/today') {
    const today = getTodayDateStr();
    const mockDoses: Dose[] = [
      {
        id: 'dose_101',
        seq: 1,
        totalDoses: 4,
        dueDate: today,
        status: 'GIVEN',
        version: 2,
        patient: { id: 'pat_01', name: 'Aarav Sharma', phoneE164: '+919876543201' },
        slotStart: `${today}T09:00:00.000Z`,
      },
      {
        id: 'dose_102',
        seq: 2,
        totalDoses: 4,
        dueDate: today,
        status: 'GIVEN',
        version: 2,
        patient: { id: 'pat_02', name: 'Sunita Devi', phoneE164: '+919876543202' },
        slotStart: `${today}T09:00:00.000Z`,
      },
      {
        id: 'dose_103',
        seq: 1,
        totalDoses: 4,
        dueDate: today,
        status: 'DUE',
        version: 1,
        patient: { id: 'pat_03', name: 'Rajesh Patel', phoneE164: '+919876543203' },
        slotStart: `${today}T09:30:00.000Z`,
      },
      {
        id: 'dose_104',
        seq: 3,
        totalDoses: 4,
        dueDate: today,
        status: 'DUE',
        version: 1,
        patient: { id: 'pat_04', name: 'Priya Verma', phoneE164: '+919876543204' },
        slotStart: `${today}T09:30:00.000Z`,
      },
      {
        id: 'dose_105',
        seq: 2,
        totalDoses: 5,
        dueDate: today,
        status: 'SCHEDULED',
        version: 1,
        patient: { id: 'pat_05', name: 'Mohammad Ansari', phoneE164: '+919876543205' },
        slotStart: `${today}T11:00:00.000Z`,
      },
      {
        id: 'dose_106',
        seq: 4,
        totalDoses: 4,
        dueDate: today,
        status: 'SCHEDULED',
        version: 1,
        patient: { id: 'pat_06', name: 'Vikram Singh', phoneE164: '+919876543206' },
        slotStart: `${today}T11:30:00.000Z`,
      },
      {
        id: 'dose_107',
        seq: 1,
        totalDoses: 4,
        dueDate: today,
        status: 'DUE',
        version: 1,
        patient: { id: 'pat_07', name: 'Anita Das', phoneE164: '+919876543207' },
        slotStart: null,
      },
      {
        id: 'dose_108',
        seq: 2,
        totalDoses: 4,
        dueDate: today,
        status: 'SCHEDULED',
        version: 1,
        patient: { id: 'pat_08', name: 'Lakshmi Narayanan', phoneE164: '+919876543208' },
        slotStart: null,
      },
      {
        id: 'dose_109',
        seq: 3,
        totalDoses: 5,
        dueDate: today,
        status: 'MISSED',
        version: 1,
        patient: { id: 'pat_09', name: 'Suresh Kumar', phoneE164: '+919876543209' },
        slotStart: `${today}T08:30:00.000Z`,
      },
      {
        id: 'dose_110',
        seq: 4,
        totalDoses: 5,
        dueDate: today,
        status: 'RECOVERED',
        version: 2,
        patient: { id: 'pat_10', name: 'Kavita Rao', phoneE164: '+919876543210' },
        slotStart: null,
      },
    ];

    return { doses: mockDoses } as T;
  }

  // 2. POST /doses/{id}/given
  const givenMatch = pathname.match(/^\/doses\/([^/]+)\/given$/);
  if (method === 'POST' && givenMatch) {
    const doseId = givenMatch[1];
    // Randomly (approx 1 in 8 calls) simulate a 409 conflict
    if (Math.random() < 0.125) {
      throw new ApiError(409, 'This dose was already recorded.');
    }

    const response: GivenDoseResponse = {
      id: doseId,
      status: 'GIVEN',
      givenAt: new Date().toISOString(),
      version: 2,
    };
    return response as T;
  }

  // 3. GET /vials?centreId=
  if (method === 'GET' && pathname === '/vials') {
    const now = Date.now();
    // Vial 1: Opened 7h15m ago, usable until now + 35 minutes (< 45 minutes, expiring soon)
    const vial1Opened = new Date(now - 7.25 * 60 * 60 * 1000).toISOString();
    const vial1Usable = new Date(now + 35 * 60 * 1000).toISOString();

    // Vial 2: Opened 9h ago, usable until now - 1 hour (already past usableUntil)
    const vial2Opened = new Date(now - 9 * 60 * 60 * 1000).toISOString();
    const vial2Usable = new Date(now - 60 * 60 * 1000).toISOString();

    // Vial 3: Opened 1h ago, usable until now + 7 hours (active)
    const vial3Opened = new Date(now - 1 * 60 * 60 * 1000).toISOString();
    const vial3Usable = new Date(now + 7 * 60 * 60 * 1000).toISOString();

    const response: VialsResponse = {
      vials: [
        {
          id: 'vial_001',
          brand: 'Rabivax-S',
          unitsTotal: 10,
          unitsUsed: 8,
          openedAt: vial1Opened,
          usableUntil: vial1Usable,
        },
        {
          id: 'vial_002',
          brand: 'Abhayrab',
          unitsTotal: 10,
          unitsUsed: 7,
          openedAt: vial2Opened,
          usableUntil: vial2Usable,
        },
        {
          id: 'vial_003',
          brand: 'Rabivax-S',
          unitsTotal: 10,
          unitsUsed: 3,
          openedAt: vial3Opened,
          usableUntil: vial3Usable,
        },
      ],
    };
    return response as T;
  }

  // 4. POST /vials/open
  if (method === 'POST' && pathname === '/vials/open') {
    const now = Date.now();
    const openedAt = new Date(now).toISOString();
    const usableUntil = new Date(now + 8 * 60 * 60 * 1000).toISOString();

    const newVial: Vial = {
      id: `vial_${Math.random().toString(36).substring(2, 9)}`,
      brand: (body.brand as string) || 'Rabivax-S',
      unitsTotal: (body.unitsTotal as number) || 10,
      unitsUsed: 0,
      openedAt,
      usableUntil,
    };
    return newVial as T;
  }

  // 5. GET /doses/missed?centreId=
  if (method === 'GET' && pathname === '/doses/missed') {
    const today = getTodayDateStr();
    const response: MissedDosesResponse = {
      doses: [
        {
          id: 'dose_m01',
          seq: 2,
          dueDate: addDaysToDateStr(today, -1),
          patient: { id: 'pat_21', name: 'Deepak Verma', phoneE164: '+919876543221' },
          reminderStatus: 'PENDING',
        },
        {
          id: 'dose_m02',
          seq: 3,
          dueDate: addDaysToDateStr(today, -2),
          patient: { id: 'pat_22', name: 'Meera Nair', phoneE164: '+919876543222' },
          reminderStatus: 'SENT',
        },
        {
          id: 'dose_m03',
          seq: 1,
          dueDate: addDaysToDateStr(today, -3),
          patient: { id: 'pat_23', name: 'Arjun Reddy', phoneE164: '+919876543223' },
          reminderStatus: 'FAILED',
        },
        {
          id: 'dose_m04',
          seq: 4,
          dueDate: addDaysToDateStr(today, -5),
          patient: { id: 'pat_24', name: 'Fatima Sheikh', phoneE164: '+919876543224' },
          reminderStatus: 'SENT',
        },
      ],
    };
    return response as T;
  }

  // 6. GET /metrics?centreId=
  if (method === 'GET' && pathname === '/metrics') {
    const response: MetricsResponse = {
      funnel: [
        { seq: 1, given: 54, scheduled: 56 },
        { seq: 2, given: 46, scheduled: 54 },
        { seq: 3, given: 39, scheduled: 46 },
        { seq: 4, given: 33, scheduled: 39 },
      ],
      vialsOpenedToday: 13,
      vialsTheoreticalMinimum: 9, // <= vialsOpenedToday
      mlDiscardedToday: 1.8,
      reminderDeliveryRate: 0.94, // between 0 and 1
    };
    return response as T;
  }

  // 7. GET /plan/tomorrow?centreId=
  if (method === 'GET' && pathname === '/plan/tomorrow') {
    const tomorrow = getTomorrowDateStr();
    const response: TomorrowPlanResponse = {
      slots: [
        {
          slotStart: `${tomorrow}T09:00:00.000Z`,
          patients: [
            { id: 'pat_31', name: 'Gaurav Joshi', seq: 1 },
            { id: 'pat_32', name: 'Ritu Sen', seq: 2 },
            { id: 'pat_33', name: 'Kiran Desai', seq: 1 },
            { id: 'pat_34', name: 'Rohan Mehra', seq: 3 },
          ],
        },
        {
          slotStart: `${tomorrow}T10:30:00.000Z`,
          patients: [
            { id: 'pat_35', name: 'Ananya Roy', seq: 2 },
            { id: 'pat_36', name: 'Naveen Bhatt', seq: 4 },
            { id: 'pat_37', name: 'Sonal Kapoor', seq: 1 },
          ],
        },
        {
          slotStart: `${tomorrow}T14:00:00.000Z`,
          patients: [
            { id: 'pat_38', name: 'Manoj Tiwari', seq: 3 },
            { id: 'pat_39', name: 'Geeta Yadav', seq: 2 },
            { id: 'pat_40', name: 'Harish Pillai', seq: 4 },
          ],
        },
      ],
      vialsNeeded: 6,
      vialsNaive: 14, // noticeably higher than vialsNeeded
    };
    return response as T;
  }

  // 8. POST /patients
  if (method === 'POST' && pathname === '/patients') {
    const patientReq = body as unknown as CreatePatientRequest;
    // Accept both snake_case (real API contract) and camelCase (legacy)
    const phoneE164 =
      (body.phone_e164 as string | undefined) ||
      (body.phoneE164 as string | undefined) ||
      '+919876543210';
    const newPatient: Patient = {
      ...patientReq,
      id: `pat_${Math.random().toString(36).substring(2, 9)}`,
      name: patientReq.name || 'Anonymous Patient',
      phoneE164,
    };
    return newPatient as T;
  }

  // 9. POST /courses
  if (method === 'POST' && pathname === '/courses') {
    const courseReq = body as unknown as CreateCourseRequest;
    const patientId = courseReq.patientId || `pat_${Math.random().toString(36).substring(2, 9)}`;
    const protocolId = courseReq.protocolId || 'IN-UTRC-ID-v1';
    const day0 = courseReq.day0 || getTodayDateStr();

    const isEssenIM = protocolId === 'IN-ESSEN-IM-v1';
    const route = isEssenIM ? 'IM' : 'ID';
    // If protocolId is "IN-UTRC-ID-v1": 4 doses at day0 + 0, 3, 7, 28 days
    // If "IN-ESSEN-IM-v1": 5 doses at day0 + 0, 3, 7, 14, 28 days
    const offsets = isEssenIM ? [0, 3, 7, 14, 28] : [0, 3, 7, 28];
    const totalDoses = offsets.length;

    const doses: Dose[] = offsets.map((offset, index) => ({
      id: `dose_${Math.random().toString(36).substring(2, 9)}`,
      seq: index + 1,
      totalDoses,
      dueDate: addDaysToDateStr(day0, offset),
      status: index === 0 ? 'DUE' : 'SCHEDULED',
      version: 1,
      patient: {
        id: patientId,
        name: (body.patientName as string) || `Patient ${patientId.slice(-4)}`,
        phoneE164: (body.phoneE164 as string) || '+919876543200',
      },
      slotStart: null,
    }));

    const course: Course = {
      id: `crs_${Math.random().toString(36).substring(2, 9)}`,
      patientId,
      protocolId,
      route,
      day0,
      doses,
      createdAt: new Date().toISOString(),
    };
    return course as T;
  }

  throw new ApiError(404, `Mock not found for [${method}] ${path}`);
}
