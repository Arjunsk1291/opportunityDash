import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClientContactInput, ClientInput, ClientProfile } from '@/types/client';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const normalizeCompanyName = (name: string): string => {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

const contactKey = (contact: ClientContactInput): string => {
  const first = String(contact.firstName || '').trim().toLowerCase();
  const last = String(contact.lastName || '').trim().toLowerCase();
  const email = String(contact.email || '').trim().toLowerCase();
  const phone = String(contact.phone || '').trim().replace(/\s+/g, '');
  if (!first && !last && !email && !phone) return '';
  return `${email}|${phone}|${first}|${last}`;
};


export const useClientStore = () => {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/clients`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to load clients');
      const data = await response.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const addClient = async (input: ClientInput) => {
    const payload = {
      ...input,
      companyName: normalizeCompanyName(input.companyName),
      contacts: input.contacts.filter((contact) => contactKey(contact)),
    };
    const response = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to save client');
    const saved = await response.json();
    setClients((prev) => {
      const idx = prev.findIndex((client) => client.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const updated = [...prev];
      updated[idx] = saved;
      return updated;
    });
  };

  const updateClient = async (id: string, update: Partial<ClientInput>) => {
    const target = clients.find((client) => client.id === id);
    if (!target) return;
    const payload = {
      companyName: update.companyName ?? target.companyName,
      domain: update.domain ?? target.domain,
      city: update.city ?? target.location.city,
      country: update.country ?? target.location.country,
      contacts: update.contacts ?? target.contacts,
    };
    await addClient(payload);
  };

  const removeClient = async (id: string) => {
    setClients((prev) => prev.filter((client) => client.id !== id));
  };

  const importClients = async (inputs: ClientInput[]) => {
    const payload = inputs.map((input) => ({
      ...input,
      companyName: normalizeCompanyName(input.companyName),
      contacts: input.contacts.filter((contact) => contactKey(contact)),
    }));
    const response = await fetch(`${API_URL}/clients/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clients: payload }),
    });
    if (!response.ok) throw new Error('Failed to import clients');
    await fetchClients();
  };

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const totalContacts = clients.reduce((sum, client) => sum + client.contacts.length, 0);
    const withContacts = clients.filter((client) => client.contacts.length > 0).length;
    const domains = new Set(clients.map((client) => client.domain).filter(Boolean)).size;
    return { totalClients, totalContacts, withContacts, domains };
  }, [clients]);

  return {
    clients,
    isLoading,
    error,
    stats,
    addClient,
    removeClient,
    updateClient,
    importClients,
    normalizeCompanyName,
    refreshClients: fetchClients,
  };
};
