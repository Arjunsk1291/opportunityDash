import React, { createContext, useContext, useState, ReactNode } from 'react';

type Currency = 'USD' | 'AED';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatCurrency: (amount: number) => string;
  convertCurrency: (amount: number, from: Currency, to: Currency) => number;
  exchangeRate: number;
  setExchangeRate: (rate: number) => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// Default exchange rate: 1 USD = 3.67 AED (UAE Dirham pegged rate)
const DEFAULT_EXCHANGE_RATE = 3.67;

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    const saved = localStorage.getItem('exchangeRate');
    return saved ? parseFloat(saved) : DEFAULT_EXCHANGE_RATE;
  });

  const updateExchangeRate = (rate: number) => {
    setExchangeRate(rate);
    localStorage.setItem('exchangeRate', rate.toString());
  };

  const convertCurrency = (amount: number, from: Currency, to: Currency): number => {
    if (from === to) return amount;
    if (from === 'USD' && to === 'AED') {
      return amount * exchangeRate;
    }
    if (from === 'AED' && to === 'USD') {
      return amount / exchangeRate;
    }
    return amount;
  };

  const formatCurrency = (amount: number): string => {
    const convertedAmount = currency === 'USD' ? amount : convertCurrency(amount, 'USD', 'AED');
    
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(convertedAmount);
    } else {
      return new Intl.NumberFormat('ar-AE', {
        style: 'currency',
        currency: 'AED',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(convertedAmount);
    }
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        formatCurrency,
        convertCurrency,
        exchangeRate,
        setExchangeRate: updateExchangeRate,
      }}
    >
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
