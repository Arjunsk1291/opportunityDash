import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import aedSymbol from '@/assets/aed-symbol.png';

export type Currency = 'USD' | 'AED';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatCurrency: (value: number) => string;
  convertValue: (value: number) => number;
  aedSymbolUrl: string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('currency');
    return (saved === 'AED' || saved === 'USD') ? saved : 'AED';
  });

  const setCurrency = useCallback((newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    localStorage.setItem('currency', newCurrency);
  }, []);

  const convertValue = useCallback((value: number): number => {
    // Keep values exactly as extracted from Excel; no FX conversion.
    return Number.isFinite(value) ? value : 0;
  }, []);

  const formatCurrency = useCallback((value: number): string => {
    const convertedValue = convertValue(value);
    if (currency === 'AED') {
      // Using text representation since we can't include image in string
      return `AED ${convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    return `$${convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }, [currency, convertValue]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatCurrency, convertValue, aedSymbolUrl: aedSymbol }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
