export interface Centre {
  id: string;
  name: string;
  city: string;
  shortName: string;
  region: string;
}

export const CENTRES: Centre[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Civil Hospital Anti-Rabies Clinic',
    city: 'Mumbai',
    shortName: 'Civil Hospital (Mumbai)',
    region: 'ap-south-1',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Sassoon General Hospital ARV Clinic',
    city: 'Pune',
    shortName: 'Sassoon General (Pune)',
    region: 'ap-south-1',
  },
];

export const DEFAULT_CENTRE_ID = 'a0000000-0000-0000-0000-000000000001';
