import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { VendorData } from '@/lib/vendors';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const useVendorStore = () => {
  const { token, canPerformAction } = useAuth();
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const writeHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  });

  const fetchVendors = useCallback(async () => {
    if (!token) {
      setVendors([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/vendors`, { method: 'GET', headers: writeHeaders() });
      if (!response.ok) throw new Error('Failed to load vendors');
      const data = await response.json();
      setVendors(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setVendors([]);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const addVendor = async (input: Omit<VendorData, 'id'>) => {
    if (!canPerformAction('vendors_write')) {
      throw new Error('You do not have permission to write vendors');
    }
    const response = await fetch(`${API_URL}/vendors`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error('Failed to save vendor');
    const saved = await response.json();
    setVendors((prev) => {
      const idx = prev.findIndex((vendor) => vendor.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    return saved as VendorData;
  };

  const updateVendor = async (id: string, update: Partial<Omit<VendorData, 'id'>>) => {
    if (!canPerformAction('vendors_write')) {
      throw new Error('You do not have permission to write vendors');
    }
    const response = await fetch(`${API_URL}/vendors/${id}`, {
      method: 'PUT',
      headers: writeHeaders(),
      body: JSON.stringify(update),
    });
    if (!response.ok) throw new Error('Failed to update vendor');
    const saved = await response.json();
    setVendors((prev) => prev.map((vendor) => vendor.id === id ? saved : vendor));
    return saved as VendorData;
  };

  const importVendors = async (inputs: Array<Omit<VendorData, 'id'>>) => {
    if (!canPerformAction('vendors_import')) {
      throw new Error('You do not have permission to import vendors');
    }
    const response = await fetch(`${API_URL}/vendors/import`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ vendors: inputs }),
    });
    if (!response.ok) throw new Error('Failed to import vendors');
    await fetchVendors();
  };

  return {
    vendors,
    isLoading,
    error,
    addVendor,
    updateVendor,
    importVendors,
    refreshVendors: fetchVendors,
  };
};
