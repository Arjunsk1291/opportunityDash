import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import aedSymbol from '@/assets/aed-symbol.png';

export type Currency = 'USD' | 'AED';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  exchangeRate: number;
  setExchangeRate: (rate: number) => void;
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
  const [exchangeRate, setExchangeRateState] = useState<number>(() => {
    const saved = Number(localStorage.getItem('usd-to-aed-rate'));
    return Number.isFinite(saved) && saved > 0 ? saved : 3.67;
  });

  const setCurrency = useCallback((newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    localStorage.setItem('currency', newCurrency);
  }, []);

  const setExchangeRate = useCallback((rate: number) => {
    const normalized = Number.isFinite(rate) && rate > 0 ? rate : 3.67;
    setExchangeRateState(normalized);
    localStorage.setItem('usd-to-aed-rate', String(normalized));
  }, []);

  const convertValue = useCallback((value: number): number => {
    const base = Number.isFinite(value) ? value : 0;
    return currency === 'AED' ? base * exchangeRate : base;
  }, [currency, exchangeRate]);

  const formatCurrency = useCallback((value: number): string => {
    const convertedValue = convertValue(value);
    if (currency === 'AED') {
      // Using text representation since we can't include image in string
      return `AED ${convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    return `$${convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }, [currency, convertValue]);

  return (
      <CurrencyContext.Provider value={{ currency, setCurrency, exchangeRate, setExchangeRate, formatCurrency, convertValue, aedSymbolUrl: aedSymbol }}>
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
