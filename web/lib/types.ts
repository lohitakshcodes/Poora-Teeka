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

export interface Course {
  id: string;
  patientId: string;
  protocolId: string;
  route: 'ID' | 'IM';
  day0: string;
  doses: Dose[];
  createdAt: string;
}
