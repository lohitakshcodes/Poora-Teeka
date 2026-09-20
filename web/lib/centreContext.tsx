'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { CENTRES, DEFAULT_CENTRE_ID, type Centre } from './centres';

interface CentreContextType {
  centreId: string;
  activeCentre: Centre;
  setCentreId: (id: string) => void;
  centres: Centre[];
}

const CentreContext = createContext<CentreContextType>({
  centreId: DEFAULT_CENTRE_ID,
  activeCentre: CENTRES[0],
  setCentreId: () => {},
  centres: CENTRES,
});

function CentreContextInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlCentreId = searchParams.get('centreId');

  const [centreId, setCentreIdState] = useState<string>(() => {
    if (urlCentreId && CENTRES.some((c) => c.id === urlCentreId)) {
      return urlCentreId;
    }
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('poorateeka_centre_id');
      if (stored && CENTRES.some((c) => c.id === stored)) {
        return stored;
      }
    }
    return DEFAULT_CENTRE_ID;
  });

  // Keep state synchronized with URL query params
  useEffect(() => {
    if (urlCentreId && CENTRES.some((c) => c.id === urlCentreId) && urlCentreId !== centreId) {
      setCentreIdState(urlCentreId);
    }
  }, [urlCentreId, centreId]);

  const setCentreId = useCallback(
    (newId: string) => {
      setCentreIdState(newId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('poorateeka_centre_id', newId);
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set('centreId', newId);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const activeCentre = useMemo(() => {
    return CENTRES.find((c) => c.id === centreId) || CENTRES[0];
  }, [centreId]);

  return (
    <CentreContext.Provider value={{ centreId, activeCentre, setCentreId, centres: CENTRES }}>
      {children}
    </CentreContext.Provider>
  );
}

export function CentreProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <CentreContextInner>{children}</CentreContextInner>
    </Suspense>
  );
}

export function useCentre() {
  return useContext(CentreContext);
}
