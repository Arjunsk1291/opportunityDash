const API_BASE_URL = 'http://localhost:3001/api';

export interface Opportunity {
  [key: string]: any;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  count?: number;
  recordCount?: number;
  lastUpdated?: string;
}

// Upload Excel file
export async function uploadExcelFile(file: File): Promise<ApiResponse<any>> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  return response.json();
}

// Get all opportunities
export async function getOpportunities(): Promise<ApiResponse<Opportunity[]>> {
  const response = await fetch(`${API_BASE_URL}/opportunities`);
  return response.json();
}

// Refresh data
export async function refreshData(): Promise<ApiResponse<any>> {
  const response = await fetch(`${API_BASE_URL}/refresh`, {
    method: 'POST',
  });
  return response.json();
}

// Set auto-refresh interval (in minutes)
export async function setAutoRefresh(intervalMinutes: number): Promise<ApiResponse<any>> {
  const response = await fetch(`${API_BASE_URL}/auto-refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intervalMinutes }),
  });
  return response.json();
}

// Disable auto-refresh
export async function disableAutoRefresh(): Promise<ApiResponse<any>> {
  const response = await fetch(`${API_BASE_URL}/auto-refresh/disable`, {
    method: 'POST',
  });
  return response.json();
}

// Get current settings
export async function getSettings(): Promise<ApiResponse<any>> {
  const response = await fetch(`${API_BASE_URL}/settings`);
  return response.json();
}

// Health check
export async function checkHealth(): Promise<ApiResponse<any>> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
}
