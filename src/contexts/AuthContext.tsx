import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { DEFAULT_PAGE_ROLE_ACCESS, PageKey } from '@/config/navigation';
import { ActionKey, DEFAULT_ACTION_ROLE_ACCESS } from '@/config/actionPermissions';

export type UserRole = 'Master' | 'Admin' | 'ProposalHead' | 'SVP' | 'Basic';
export type UserStatus = 'approved' | 'pending' | 'rejected';

export interface User {
  id?: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  assignedGroup?: string | null;
  lastLogin?: Date;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isMaster: boolean;
  isAdmin: boolean;
  isProposalHead: boolean;
  isSVP: boolean;
  isLoading: boolean;
  isPending: boolean;
  authError: string | null;
  logout: () => void;
  token: string | null;
  getAllUsers: () => User[];
  updateUserRole: (userId: string, newRole: UserRole, assignedGroup?: string) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  pagePermissions: Record<PageKey, UserRole[]>;
  pageEmailPermissions: Record<PageKey, string[]>;
  canAccessPage: (pageKey: PageKey) => boolean;
  updatePagePermissions: (permissions: Record<PageKey, UserRole[]>, emailPermissions?: Record<PageKey, string[]>) => Promise<void>;
  actionPermissions: Record<ActionKey, UserRole[]>;
  actionEmailPermissions: Record<ActionKey, string[]>;
  canPerformAction: (actionKey: ActionKey) => boolean;
  updateActionPermissions: (permissions: Record<ActionKey, UserRole[]>, emailPermissions?: Record<ActionKey, string[]>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = import.meta.env.VITE_API_URL || '/api';
interface AuthorizedUserResponse {
  id?: string;
  _id?: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  assignedGroup?: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pagePermissions, setPagePermissions] = useState<Record<PageKey, UserRole[]>>(DEFAULT_PAGE_ROLE_ACCESS as Record<PageKey, UserRole[]>);
  const [pageEmailPermissions, setPageEmailPermissions] = useState<Record<PageKey, string[]>>({} as Record<PageKey, string[]>);
  const [actionPermissions, setActionPermissions] = useState<Record<ActionKey, UserRole[]>>(DEFAULT_ACTION_ROLE_ACCESS as Record<ActionKey, UserRole[]>);
  const [actionEmailPermissions, setActionEmailPermissions] = useState<Record<ActionKey, string[]>>({} as Record<ActionKey, string[]>);

  const authHeaders = useCallback(
    () => token ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : { 'Content-Type': 'application/json' },
    [token]
  );

  const refreshCurrentUser = useCallback(async () => {
    if (!token) return;
    const response = await fetch(API_URL + '/auth/user', { headers: authHeaders() });
    if (!response.ok) {
      throw new Error('Failed to refresh user');
    }
    const data = await response.json();
    const nextUser: User = {
      email: data.email,
      displayName: data.displayName || data.email,
      role: data.role,
      status: data.status,
      assignedGroup: data.assignedGroup || null,
    };
    setUser(nextUser);
    setIsPending(nextUser.status === 'pending');
    setAuthError(null);
  }, [authHeaders, token]);

  const clearAuthState = useCallback(() => {
    setUser(null);
    setToken(null);
    setAllUsers([]);
    setIsPending(false);
    setAuthError(null);
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearAuthState();
    window.dispatchEvent(new CustomEvent('app:logout'));
  }, [clearAuthState]);

  const loginWithUsername = useCallback(async (username: string) => {
    const normalizedUsername = username.trim().toLowerCase();
    const response = await fetch(API_URL + '/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalizedUsername }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Manual login verify-token failed', {
        endpoint: API_URL + '/auth/verify-token',
        status: response.status,
        statusText: response.statusText,
        username: normalizedUsername,
      });
      throw new Error(data.error || 'Login failed');
    }

    const nextUser: User = {
      email: data.user.email,
      displayName: data.user.displayName || data.user.email,
      role: data.user.role,
      status: data.user.status,
      assignedGroup: data.user.assignedGroup || null,
    };

    setUser(nextUser);
    setToken(normalizedUsername);
    setAuthError(null);

    if (nextUser.status === 'pending') {
      setIsPending(true);
      return;
    }

    setIsPending(false);
    await fetch(API_URL + '/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + normalizedUsername,
      },
    });
  }, []);

  useEffect(() => {
    const handleMsalUser = (event: Event) => {
      const detail = (event as CustomEvent).detail as { username?: string | null };
      const nextUsername = detail?.username ? String(detail.username).toLowerCase() : '';
      if (!nextUsername) {
        clearAuthState();
        return;
      }
      if (nextUsername === token) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      loginWithUsername(nextUsername).then(() => {
        setIsLoading(false);
      }).catch((error) => {
        console.error('MSAL username sync failed:', error);
        setAuthError('Auth service unavailable');
        setIsLoading(false);
      });
    };

    window.addEventListener('msal:user', handleMsalUser as EventListener);
    return () => window.removeEventListener('msal:user', handleMsalUser as EventListener);
  }, [clearAuthState, loginWithUsername, token]);

  const getAllUsers = useCallback(() => allUsers, [allUsers]);

  const fetchUsers = useCallback(async () => {
    if (!token || user?.role !== 'Master') return;
    const response = await fetch(API_URL + '/users/authorized', { headers: authHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    setAllUsers((data as AuthorizedUserResponse[]).map((u) => ({
      id: u.id || u._id,
      email: u.email,
      displayName: u.displayName || u.email,
      role: u.role,
      status: u.status,
      assignedGroup: u.assignedGroup || null,
    })));
  }, [authHeaders, token, user?.role]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const loadPagePermissions = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/navigation/permissions', { headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.permissions) {
        setPagePermissions(data.permissions);
      }
      if (data?.emailPermissions) {
        setPageEmailPermissions(data.emailPermissions);
      }
    } catch (error) {
      console.error('Failed to load page permissions', error);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    loadPagePermissions();
  }, [loadPagePermissions]);

  const loadActionPermissions = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/action-permissions', { headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.permissions) {
        setActionPermissions(data.permissions);
      }
      if (data?.emailPermissions) {
        setActionEmailPermissions(data.emailPermissions);
      }
    } catch (error) {
      console.error('Failed to load action permissions', error);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    loadActionPermissions();
  }, [loadActionPermissions]);

  const updatePagePermissions = useCallback(async (permissions: Record<PageKey, UserRole[]>, emailPermissions?: Record<PageKey, string[]>) => {
    if (!token || user?.role !== 'Master') {
      throw new Error('Only Master users can update page permissions');
    }

    const response = await fetch(API_URL + '/navigation/permissions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ permissions, emailPermissions: emailPermissions || pageEmailPermissions }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to update page permissions');
    }

    if (data?.permissions) setPagePermissions(data.permissions);
    if (data?.emailPermissions) setPageEmailPermissions(data.emailPermissions);
  }, [authHeaders, pageEmailPermissions, token, user?.role]);

  const updateUserRole = useCallback(async (userId: string, newRole: UserRole, assignedGroup?: string) => {
    if (!token || user?.role !== 'Master') {
      throw new Error('Only Master users can change roles');
    }

    const targetUser = allUsers.find((u) => (u.id || u.email) === userId);
    if (!targetUser) {
      throw new Error('User not found');
    }

    const response = await fetch(API_URL + '/users/change-role', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        email: targetUser.email,
        newRole,
        assignedGroup: newRole === 'SVP' ? (assignedGroup || targetUser.assignedGroup || null) : null,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update role');
    }

    await fetchUsers();
  }, [allUsers, authHeaders, fetchUsers, token, user?.role]);

  const canAccessPage = useCallback((pageKey: PageKey) => {
    if (!user || user.status !== 'approved') return false;
    const allowedRoles = pagePermissions[pageKey] || [];
    const allowedEmails = pageEmailPermissions[pageKey] || [];
    const email = String(user.email || '').trim().toLowerCase();
    return allowedRoles.includes(user.role) || allowedEmails.includes(email);
  }, [pageEmailPermissions, pagePermissions, user]);

  const canPerformAction = useCallback((actionKey: ActionKey) => {
    if (!user || user.status !== 'approved') return false;
    const allowedRoles = actionPermissions[actionKey] || [];
    const allowedEmails = actionEmailPermissions[actionKey] || [];
    const email = String(user.email || '').trim().toLowerCase();
    return allowedRoles.includes(user.role) || allowedEmails.includes(email);
  }, [actionEmailPermissions, actionPermissions, user]);

  const updateActionPermissions = useCallback(async (permissions: Record<ActionKey, UserRole[]>, emailPermissions?: Record<ActionKey, string[]>) => {
    if (!token || user?.role !== 'Master') {
      throw new Error('Only Master users can update action permissions');
    }

    const response = await fetch(API_URL + '/action-permissions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ permissions, emailPermissions: emailPermissions || actionEmailPermissions }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to update action permissions');
    }

    if (data?.permissions) setActionPermissions(data.permissions);
    if (data?.emailPermissions) setActionEmailPermissions(data.emailPermissions);
  }, [actionEmailPermissions, authHeaders, token, user?.role]);

  const isAuthenticated = user !== null && token !== null;
  const isMaster = user?.role === 'Master' && user?.status === 'approved';
  const isAdmin = ['Admin', 'Master'].includes(user?.role || '') && user?.status === 'approved';
  const isProposalHead = ['ProposalHead', 'Master'].includes(user?.role || '') && user?.status === 'approved';
  const isSVP = ['SVP', 'Master'].includes(user?.role || '') && user?.status === 'approved';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isMaster,
        isAdmin,
        isProposalHead,
        isSVP,
        isLoading,
        isPending,
        authError,
        logout,
        token,
        getAllUsers,
        updateUserRole,
        refreshCurrentUser,
        pagePermissions,
        pageEmailPermissions,
        canAccessPage,
        updatePagePermissions,
        actionPermissions,
        actionEmailPermissions,
        canPerformAction,
        updateActionPermissions,
      }}
    >
      {authError && (
        <div
          role="alert"
          style={{
            margin: '12px',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #f5c2c7',
            backgroundColor: '#f8d7da',
            color: '#842029',
            fontWeight: 600,
          }}
        >
          Auth service unavailable
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
