export type DoseStatus = 'SCHEDULED' | 'DUE' | 'GIVEN' | 'MISSED' | 'RECOVERED';

export type ReminderStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface PatientRef {
  id: string;
  name: string;
  phoneE164: string;
}

export interface Dose {
  id: string;
  seq: number;
  totalDoses: number;
  dueDate: string; // YYYY-MM-DD
  status: DoseStatus;
  version: number;
  patient: PatientRef;
  slotStart: string | null; // ISO datetime or null
  route?: 'ID' | 'IM';
}

export interface TodayDosesResponse {
  doses: Dose[];
}

export interface GivenDoseResponse {
  id: string;
  status: 'GIVEN';
  givenAt: string; // ISO datetime
  version: number;
}

export interface Vial {
  id: string;
  brand: string;
  unitsTotal: number;
  unitsUsed: number;
  openedAt: string; // ISO datetime
  usableUntil: string; // ISO datetime
}

export interface VialsResponse {
  vials: Vial[];
}

export interface OpenVialRequest {
  brand?: string;
  unitsTotal?: number;
  centreId?: string;
}

export interface MissedDose {
  id: string;
  seq: number;
  dueDate: string; // YYYY-MM-DD
  patient: PatientRef;
  reminderStatus: ReminderStatus;
}

export interface MissedDosesResponse {
  doses: MissedDose[];
}

export interface FunnelStep {
  seq: number;
  given: number;
  scheduled: number;
}

export interface MetricsResponse {
  funnel: FunnelStep[];
  vialsOpenedToday: number;
  vialsTheoreticalMinimum: number;
  mlDiscardedToday: number;
  reminderDeliveryRate: number;
}

export interface PlanPatient {
  id: string;
  name: string;
  seq: number;
}

export interface PlanSlot {
  slotStart: string; // ISO datetime
  patients: PlanPatient[];
}

export interface TomorrowPlanResponse {
  slots: PlanSlot[];
  vialsNeeded: number;
  vialsNaive: number;
}

export interface CreatePatientRequest {
  name: string;
  phoneE164: string;
  [key: string]: unknown;
}

export interface Patient extends CreatePatientRequest {
  id: string;
}

export interface CreateCourseRequest {
  patientId: string;
  protocolId: 'IN-UTRC-ID-v1' | 'IN-ESSEN-IM-v1' | string;
  day0: string; // YYYY-MM-DD or ISO string
}

export type ProtocolCategory = 'Rabies' | 'BCG' | 'Hepatitis B';

export interface ProtocolMetadata {
  id: string;
  dbId: string;
  name: string;
  category: ProtocolCategory;
  disease: string;
  route: 'ID' | 'IM';
  visitOffsets: number[];
  unitsPerVisit: number;
  openVialMinutes: number;
  description: string;
  recommendedVialCapacity: number;
}

export const PROTOCOLS: ProtocolMetadata[] = [
  {
    id: 'IN-UTRC-ID-v1',
    dbId: 'thai_red_cross_id',
    name: 'Updated Thai Red Cross (2-site ID)',
    category: 'Rabies',
    disease: 'Rabies Post-Exposure Prophylaxis',
    route: 'ID',
    visitOffsets: [0, 3, 7, 28],
    unitsPerVisit: 2,
    openVialMinutes: 480,
    description: '4 visits (Days 0, 3, 7, 28) • 2 injection sites per visit • 8-hour vial window',
    recommendedVialCapacity: 10,
  },
  {
    id: 'IN-ESSEN-IM-v1',
    dbId: 'essen_im',
    name: 'Essen Regimen (1-site IM)',
    category: 'Rabies',
    disease: 'Rabies Post-Exposure Prophylaxis',
    route: 'IM',
    visitOffsets: [0, 3, 7, 14, 28],
    unitsPerVisit: 1,
    openVialMinutes: 480,
    description: '5 visits (Days 0, 3, 7, 14, 28) • 1 site IM (1 full vial per visit)',
    recommendedVialCapacity: 1,
  },
  {
    id: 'IN-BCG-v1',
    dbId: 'IN-BCG-v1',
    name: 'BCG — single dose (newborn)',
    category: 'BCG',
    disease: 'Tuberculosis Protection',
    route: 'ID',
    visitOffsets: [0],
    unitsPerVisit: 1,
    openVialMinutes: 360,
    description: 'Single dose at birth • 0.05 mL intradermal • 4–6 hour open-vial window',
    recommendedVialCapacity: 20,
  },
  {
    id: 'IN-HEPB-IM-v1',
    dbId: 'IN-HEPB-IM-v1',
    name: 'Hepatitis B — 3 doses',
    category: 'Hepatitis B',
    disease: 'Hepatitis B Immunization',
    route: 'IM',
    visitOffsets: [0, 30, 180],
    unitsPerVisit: 1,
    openVialMinutes: 40320,
    description: '3 visits (Day 0, Month 1, Month 6) • 1 site IM • 28-day open vial policy',
    recommendedVialCapacity: 1,
  },
];

export interface Course {
  id: string;
  patientId: string;
  protocolId: string;
  route: 'ID' | 'IM';
  day0: string;
  doses: Dose[];
  createdAt: string;
}

