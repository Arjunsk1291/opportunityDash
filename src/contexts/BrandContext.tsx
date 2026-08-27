import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import intlLogo from '@/assets/Avenir_Logo.avif';
import oilfieldLogo from '@/assets/avenir-oilfield-logo.png';

export type BrandKey = 'avenir_intl' | 'avenir_oilfield';

export interface BrandConfig {
  key: BrandKey;
  label: string;
  shortLabel: string;
  logo: string;
}

const BRANDS: Record<BrandKey, BrandConfig> = {
  avenir_intl: {
    key: 'avenir_intl',
    label: 'Avenir International Engineers',
    shortLabel: 'Avenir Intl',
    logo: intlLogo,
  },
  avenir_oilfield: {
    key: 'avenir_oilfield',
    label: 'Avenir Oil Field Equipments',
    shortLabel: 'Avenir Oilfield',
    logo: oilfieldLogo,
  },
};

const STORAGE_KEY = 'opportunityDash.activeBrand';

interface BrandContextType {
  activeBrand: BrandConfig;
  brandKey: BrandKey;
  brands: BrandConfig[];
  setBrandKey: (key: BrandKey) => void;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brandKey, setBrandKeyState] = useState<BrandKey>('avenir_intl');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as BrandKey | null;
    if (saved && BRANDS[saved]) setBrandKeyState(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, brandKey);
  }, [brandKey]);

  const value = useMemo(() => ({
    activeBrand: BRANDS[brandKey],
    brandKey,
    brands: Object.values(BRANDS),
    setBrandKey: setBrandKeyState,
  }), [brandKey]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (!context) throw new Error('useBrand must be used within BrandProvider');
  return context;
}

