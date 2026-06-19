const API_URL = import.meta.env.VITE_API_URL || '/api';

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export type NotifyRecipient = {
  email: string;
  displayName: string;
  role: string;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export const fetchNotifyRecipients = async (token: string): Promise<NotifyRecipient[]> => {
  const response = await fetch(`${API_URL}/users/authorized`, {
    headers: authHeaders(token),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Failed to load users');
  const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
  const recipients: NotifyRecipient[] = users
    .filter((u: { status?: string }) => !u.status || u.status === 'approved')
    .map((u: { email?: string; displayName?: string; role?: string }) => ({
      email: String(u.email || '').trim(),
      displayName: String(u.displayName || '').trim() || String(u.email || ''),
      role: String(u.role || ''),
    }))
    .filter((u: NotifyRecipient) => Boolean(u.email));

  const isSrini = (r: NotifyRecipient) => /srini/i.test(r.displayName) || /srini/i.test(r.email);
  return [...recipients].sort((a, b) => {
    const aPinned = isSrini(a) ? 0 : 1;
    const bPinned = isSrini(b) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    return a.displayName.localeCompare(b.displayName);
  });
};

export const archiveUploadedSheet = async (
  token: string,
  payload: { filename: string; contentBase64: string; rowCount: number; createdCount: number; updatedCount: number },
): Promise<string> => {
  const response = await fetch(`${API_URL}/opportunities/sheet-upload/archive`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Failed to store uploaded sheet');
  return String(data?.archiveId || '');
};

export const notifySheetUpload = async (token: string, archiveId: string, recipientEmails: string[]): Promise<number> => {
  const response = await fetch(`${API_URL}/opportunities/sheet-upload/notify`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ archiveId, recipientEmails }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Failed to send notification email');
  return Number(data?.recipientCount) || 0;
};
