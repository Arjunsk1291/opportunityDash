const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface Opportunity {
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  count?: number;
  recordCount?: number;
  lastUpdated?: string;
}

export async function uploadExcelFile(file: File): Promise<ApiResponse<Record<string, unknown>>> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(API_BASE_URL + '/upload', {
    method: 'POST',
    body: formData,
  });
  return response.json();
}

export async function getOpportunities(): Promise<ApiResponse<Opportunity[]>> {
  const response = await fetch(API_BASE_URL + '/opportunities');
  return response.json();
}

export async function refreshData(): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await fetch(API_BASE_URL + '/refresh', {
    method: 'POST',
  });
  return response.json();
}

export async function setAutoRefresh(intervalMinutes: number): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await fetch(API_BASE_URL + '/auto-refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intervalMinutes }),
  });
  return response.json();
}

export async function disableAutoRefresh(): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await fetch(API_BASE_URL + '/auto-refresh/disable', {
    method: 'POST',
  });
  return response.json();
}

export async function getSettings(): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await fetch(API_BASE_URL + '/settings');
  return response.json();
}

export async function checkHealth(): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await fetch(API_BASE_URL + '/health');
  return response.json();
}
