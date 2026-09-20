import React from 'react';
import { PatientPortalView, type PatientStatusData } from './PatientPortalView';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://o025clnwai.execute-api.ap-south-1.amazonaws.com';

async function getPatientStatus(token: string): Promise<PatientStatusData | null> {
  const normalizedBase = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const url = `${normalizedBase}/patients/status/${token}`;

  try {
    const res = await fetch(url, {
      cache: 'no-store', // Always fetch fresh dose status
    });

    if (!res.ok) {
      console.warn(`[Portal SSR] Fetch to ${url} returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as PatientStatusData;
    return data;
  } catch (err) {
    console.error(`[Portal SSR] Failed to fetch patient status from ${url}:`, err);
    return null;
  }
}

export default async function PatientStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const token = resolvedParams.token;
  const initialData = await getPatientStatus(token);

  return <PatientPortalView initialData={initialData} token={token} />;
}
