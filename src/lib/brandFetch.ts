import type { BrandKey } from '@/contexts/BrandContext';

const originalFetch = window.fetch.bind(window);

function getBrandKey(): BrandKey {
  const saved = window.localStorage.getItem('opportunityDash.activeBrand');
  return saved === 'avenir_oilfield' ? 'avenir_oilfield' : 'avenir_intl';
}

window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('x-brand-key')) {
    headers.set('x-brand-key', getBrandKey());
  }
  return originalFetch(input, { ...init, headers });
};

