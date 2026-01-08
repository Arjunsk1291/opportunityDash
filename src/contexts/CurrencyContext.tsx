import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type Currency = 'USD' | 'AED';

const USD_TO_AED_RATE = 3.67;

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatCurrency: (value: number) => string;
  convertValue: (value: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('currency');
    return (saved === 'AED' || saved === 'USD') ? saved : 'USD';
  });

  const setCurrency = useCallback((newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    localStorage.setItem('currency', newCurrency);
  }, []);

  const convertValue = useCallback((value: number): number => {
    if (currency === 'AED') {
      return value * USD_TO_AED_RATE;
    }
    return value;
  }, [currency]);

  const formatCurrency = useCallback((value: number): string => {
    const convertedValue = convertValue(value);
    if (currency === 'AED') {
      return `د.إ ${convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    return `$${convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }, [currency, convertValue]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatCurrency, convertValue }}>
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
