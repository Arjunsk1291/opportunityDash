/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { DEFAULT_PAGE_ROLE_ACCESS, PageKey } from '@/config/navigation';
import { ActionKey, DEFAULT_ACTION_ROLE_ACCESS } from '@/config/actionPermissions';

export type UserRole = 'Master' | 'Admin' | 'ProposalHead' | 'SVP' | 'BDTeam' | 'Basic' | 'TempUser';
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

export type UserPageOverride = { email: string; pageKey: PageKey; access: 'view' | 'edit' };

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
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginWithRolePassword: (userId: string, password: string) => Promise<void>;
  loginAsRole: (role: UserRole, emailOverride?: string) => Promise<void>;
  pagePermissions: Record<PageKey, UserRole[]>;
  pageExcludePermissions: Record<PageKey, UserRole[]>;
  pageEmailPermissions: Record<PageKey, string[]>;
  canAccessPage: (pageKey: PageKey) => boolean;
  canViewPage: (pageKey: PageKey) => boolean;
  canEditPage: (pageKey: PageKey) => boolean;
  pageViewAccess: Record<PageKey, UserRole[]>;
  pageEditAccess: Record<PageKey, UserRole[]>;
  userPageOverrides: UserPageOverride[];
  pageEditActionMap: Record<string, string[]>;
  updatePagePermissions: (
    permissions: Record<PageKey, UserRole[]>,
    emailPermissions?: Record<PageKey, string[]>,
    excludePermissions?: Record<PageKey, UserRole[]>,
  ) => Promise<void>;
  updatePermissionsV2: (
    pageViewAccess: Record<PageKey, UserRole[]>,
    pageEditAccess: Record<PageKey, UserRole[]>,
    userPageOverrides: UserPageOverride[],
  ) => Promise<void>;
  reloadPagePermissions: () => Promise<void>;
  actionPermissions: Record<ActionKey, UserRole[]>;
  actionEmailPermissions: Record<ActionKey, string[]>;
  canPerformAction: (actionKey: ActionKey) => boolean;
  updateActionPermissions: (permissions: Record<ActionKey, UserRole[]>, emailPermissions?: Record<ActionKey, string[]>) => Promise<void>;
  reloadActionPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = import.meta.env.VITE_API_URL || '/api';
const SESSION_REFRESH_LEEWAY_MS = 2 * 60 * 1000;
const FALLBACK_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const PERMISSIONS_REFRESH_INTERVAL_MS = 30 * 1000;
interface AuthorizedUserResponse {
  id?: string;
  _id?: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  assignedGroup?: string | null;
}
interface VerifyTokenResponse {
  success: boolean;
  user: AuthorizedUserResponse;
  sessionToken?: string;
  error?: string;
}
interface RefreshTokenResponse {
  success: boolean;
  sessionToken?: string;
  error?: string;
}
interface PermissionsBootstrapResponse {
  success: boolean;
  pagePermissions?: Record<PageKey, UserRole[]>;
  pageExcludePermissions?: Record<PageKey, UserRole[]>;
  pageEmailPermissions?: Record<PageKey, string[]>;
  actionPermissions?: Record<ActionKey, UserRole[]>;
  actionEmailPermissions?: Record<ActionKey, string[]>;
  errors?: Array<{ key: string; message: string }>;
}
interface CurrentUserResponse {
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  assignedGroup?: string | null;
}

async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options?: { timeoutMs?: number },
): Promise<{ response: Response; data: T }> {
  const timeoutMs = options?.timeoutMs ?? 25000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const data = (await response.json().catch(() => ({}))) as T;
    return { response, data };
  } finally {
    window.clearTimeout(timer);
  }
}

function parseJwtExpiryMs(jwtToken: string): number | null {
  try {
    const parts = jwtToken.split('.');
    if (parts.length < 2) return null;
    const payloadPart = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = window.atob(payloadPart.padEnd(Math.ceil(payloadPart.length / 4) * 4, '='));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp || typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pagePermissions, setPagePermissions] = useState<Record<PageKey, UserRole[]>>(DEFAULT_PAGE_ROLE_ACCESS as Record<PageKey, UserRole[]>);
  const [pageExcludePermissions, setPageExcludePermissions] = useState<Record<PageKey, UserRole[]>>({} as Record<PageKey, UserRole[]>);
  const [pageEmailPermissions, setPageEmailPermissions] = useState<Record<PageKey, string[]>>({} as Record<PageKey, string[]>);
  const [actionPermissions, setActionPermissions] = useState<Record<ActionKey, UserRole[]>>(DEFAULT_ACTION_ROLE_ACCESS as Record<ActionKey, UserRole[]>);
  const [actionEmailPermissions, setActionEmailPermissions] = useState<Record<ActionKey, string[]>>({} as Record<ActionKey, string[]>);
  const [pageViewAccess, setPageViewAccess] = useState<Record<PageKey, UserRole[]>>({} as Record<PageKey, UserRole[]>);
  const [pageEditAccess, setPageEditAccess] = useState<Record<PageKey, UserRole[]>>({} as Record<PageKey, UserRole[]>);
  const [userPageOverrides, setUserPageOverrides] = useState<UserPageOverride[]>([]);
  const [pageEditActionMap, setPageEditActionMap] = useState<Record<string, string[]>>({});
  const permissionsRefreshRef = React.useRef<Promise<void> | null>(null);

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
    const data = (await response.json()) as CurrentUserResponse;
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
    window.sessionStorage.removeItem('simpleAuthToken');
  }, []);

  const logout = useCallback(() => {
    clearAuthState();
    window.dispatchEvent(new CustomEvent('app:logout'));
  }, [clearAuthState]);

  const refreshSessionToken = useCallback(async () => {
    if (!token) return;
    const response = await fetch(API_URL + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    });
    if (!response.ok) {
      throw new Error('Session refresh failed');
    }

    const data = (await response.json()) as RefreshTokenResponse;
    if (data.sessionToken) {
      setToken(data.sessionToken);
      window.sessionStorage.setItem('simpleAuthToken', data.sessionToken);
    }
  }, [token]);

  const loginAsRole = useCallback(async (role: UserRole, emailOverride?: string) => {
    const response = await fetch(API_URL + '/auth/simple-role-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        email: String(emailOverride || '').trim().toLowerCase() || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Role login failed');
    }

    const nextUser: User = {
      email: data.user.email,
      displayName: data.user.displayName || data.user.email,
      role: data.user.role,
      status: data.user.status,
      assignedGroup: data.user.assignedGroup || null,
    };

    setUser(nextUser);
    setToken(data.sessionToken || null);
    if (data.sessionToken) {
      window.sessionStorage.setItem('simpleAuthToken', data.sessionToken);
    }
    setAuthError(null);
    setIsPending(nextUser.status === 'pending');
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const response = await fetch(API_URL + '/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Password login failed');
    }
    const nextUser: User = {
      email: data.user.email,
      displayName: data.user.displayName || data.user.email,
      role: data.user.role,
      status: data.user.status,
      assignedGroup: data.user.assignedGroup || null,
    };
    setUser(nextUser);
    setToken(data.sessionToken || null);
    if (data.sessionToken) {
      window.sessionStorage.setItem('simpleAuthToken', data.sessionToken);
    }
    setAuthError(null);
    setIsPending(nextUser.status === 'pending');
  }, []);

  const loginWithRolePassword = useCallback(async (userId: string, password: string) => {
    const normalizedUserId = String(userId || '').trim();
    const response = await fetch(API_URL + '/auth/role-password-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: normalizedUserId, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Role login failed');
    }
    const nextUser: User = {
      email: data.user.email,
      displayName: data.user.displayName || data.user.email,
      role: data.user.role,
      status: data.user.status,
      assignedGroup: data.user.assignedGroup || null,
    };
    setUser(nextUser);
    setToken(data.sessionToken || null);
    setAuthError(null);
    setIsPending(nextUser.status === 'pending');
  }, []);

  useEffect(() => {
    const restore = async () => {
      const saved = window.sessionStorage.getItem('simpleAuthToken');
      if (!saved) {
        setIsLoading(false);
        return;
      }
      setToken(saved);
      try {
        const response = await fetch(API_URL + '/auth/user', {
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + saved },
        });
        if (!response.ok) {
          clearAuthState();
          return;
        }
        const data = (await response.json()) as CurrentUserResponse;
        setUser({
          email: data.email,
          displayName: data.displayName || data.email,
          role: data.role,
          status: data.status,
          assignedGroup: data.assignedGroup || null,
        });
        setIsPending(data.status === 'pending');
        setAuthError(null);
      } catch {
        clearAuthState();
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, [clearAuthState]);

  useEffect(() => {
    if (!token || !user?.email) return;

    const expiryMs = parseJwtExpiryMs(token);
    const refreshInMs = expiryMs
      ? Math.max(0, expiryMs - Date.now() - SESSION_REFRESH_LEEWAY_MS)
      : FALLBACK_REFRESH_INTERVAL_MS;

    const timer = window.setTimeout(() => {
      refreshSessionToken().catch((error) => {
        // Keep console quiet; auth state will be cleared if refresh fails.
      });
    }, refreshInMs);

    return () => window.clearTimeout(timer);
  }, [refreshSessionToken, token, user?.email]);

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

  const loadPermissionsBundle = useCallback(async () => {
    if (!token) return;
    if (permissionsRefreshRef.current) return permissionsRefreshRef.current;

    const request = (async () => {
      try {
        const [bootstrapResponse, v2Response] = await Promise.all([
          fetch(API_URL + '/permissions/bootstrap', { headers: authHeaders() }),
          fetch(API_URL + '/permissions/v2', { headers: authHeaders() }),
        ]);

        if (bootstrapResponse.ok) {
          const data = (await bootstrapResponse.json()) as PermissionsBootstrapResponse;
          if (data?.pagePermissions) setPagePermissions(data.pagePermissions);
          if (data?.pageExcludePermissions) setPageExcludePermissions(data.pageExcludePermissions);
          if (data?.pageEmailPermissions) setPageEmailPermissions(data.pageEmailPermissions);
          if (data?.actionPermissions) setActionPermissions(data.actionPermissions);
          if (data?.actionEmailPermissions) setActionEmailPermissions(data.actionEmailPermissions);
        }

        if (v2Response.ok) {
          const v2Data = await v2Response.json() as {
            pageViewAccess?: Record<PageKey, UserRole[]>;
            pageEditAccess?: Record<PageKey, UserRole[]>;
            userPageOverrides?: UserPageOverride[];
            pageEditActionMap?: Record<string, string[]>;
          };
          if (v2Data?.pageViewAccess) setPageViewAccess(v2Data.pageViewAccess);
          if (v2Data?.pageEditAccess) setPageEditAccess(v2Data.pageEditAccess);
          if (v2Data?.userPageOverrides) setUserPageOverrides(v2Data.userPageOverrides);
          if (v2Data?.pageEditActionMap) setPageEditActionMap(v2Data.pageEditActionMap);
        }
      } catch {
        try {
          const [pageResponse, actionResponse] = await Promise.all([
            fetch(API_URL + '/navigation/permissions', { headers: authHeaders() }),
            fetch(API_URL + '/action-permissions', { headers: authHeaders() }),
          ]);

          if (pageResponse.ok) {
            const pageData = await pageResponse.json();
            if (pageData?.permissions) setPagePermissions(pageData.permissions);
            if (pageData?.excludePermissions) setPageExcludePermissions(pageData.excludePermissions);
            if (pageData?.emailPermissions) setPageEmailPermissions(pageData.emailPermissions);
          }

          if (actionResponse.ok) {
            const actionData = await actionResponse.json();
            if (actionData?.permissions) setActionPermissions(actionData.permissions);
            if (actionData?.emailPermissions) setActionEmailPermissions(actionData.emailPermissions);
          }
        } catch {
          // Keep console quiet; permissions failures should not spam console in prod.
        }
      }
    })().finally(() => {
      permissionsRefreshRef.current = null;
    });

    permissionsRefreshRef.current = request;
    return request;
  }, [authHeaders, token]);

  useEffect(() => {
    loadPermissionsBundle();
  }, [loadPermissionsBundle]);

  const reloadPermissionsBundle = useCallback(async () => {
    await loadPermissionsBundle();
  }, [loadPermissionsBundle]);
  useEffect(() => {
    if (!token || !user?.email || user.status !== 'approved') return;

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      loadPermissionsBundle();
    };

    const intervalId = window.setInterval(refresh, PERMISSIONS_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onConfigUpdated = () => refresh();
    const onFocus = () => refresh();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('app:config-updated', onConfigUpdated as EventListener);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('app:config-updated', onConfigUpdated as EventListener);
    };
  }, [loadPermissionsBundle, token, user?.email, user?.status]);

  const updatePagePermissions = useCallback(async (
    permissions: Record<PageKey, UserRole[]>,
    emailPermissions?: Record<PageKey, string[]>,
    excludePermissions?: Record<PageKey, UserRole[]>,
  ) => {
    if (!token || user?.role !== 'Master') {
      throw new Error('Only Master users can update page permissions');
    }
    if (!emailPermissions || !excludePermissions) {
      throw new Error('Missing page permissions payload');
    }

    const { response, data } = await fetchJsonWithTimeout<{
      error?: string;
      permissions?: Record<PageKey, UserRole[]>;
      excludePermissions?: Record<PageKey, UserRole[]>;
      emailPermissions?: Record<PageKey, string[]>;
    }>(
      API_URL + '/navigation/permissions',
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          permissions,
          emailPermissions,
          excludePermissions,
        }),
      },
      { timeoutMs: 25000 },
    );
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to update page permissions');
    }

    if (data?.permissions) setPagePermissions(data.permissions);
    if (data?.excludePermissions) setPageExcludePermissions(data.excludePermissions);
    if (data?.emailPermissions) setPageEmailPermissions(data.emailPermissions);
  }, [authHeaders, token, user?.role]);

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
    const excludedRoles = pageExcludePermissions[pageKey] || [];
    const allowedEmails = pageEmailPermissions[pageKey] || [];
    const email = String(user.email || '').trim().toLowerCase();
    if (allowedEmails.includes(email)) return true;
    return allowedRoles.includes(user.role) && !excludedRoles.includes(user.role);
  }, [pageEmailPermissions, pageExcludePermissions, pagePermissions, user]);

  const canViewPage = useCallback((pageKey: PageKey) => {
    if (!user || user.status !== 'approved') return false;
    if (user.role === 'Master') return true;
    const email = String(user.email || '').trim().toLowerCase();
    const override = userPageOverrides.find((o) => o.email === email && o.pageKey === pageKey);
    if (override) return true;
    const viewRoles = pageViewAccess[pageKey] || [];
    if (viewRoles.length > 0) return viewRoles.includes(user.role);
    return canAccessPage(pageKey);
  }, [canAccessPage, pageViewAccess, user, userPageOverrides]);

  const canEditPage = useCallback((pageKey: PageKey) => {
    if (!user || user.status !== 'approved') return false;
    if (user.role === 'Master') return true;
    const email = String(user.email || '').trim().toLowerCase();
    const override = userPageOverrides.find((o) => o.email === email && o.pageKey === pageKey);
    if (override?.access === 'edit') return true;
    const editRoles = pageEditAccess[pageKey] || [];
    return editRoles.includes(user.role);
  }, [pageEditAccess, user, userPageOverrides]);

  const updatePermissionsV2 = useCallback(async (
    newPageViewAccess: Record<PageKey, UserRole[]>,
    newPageEditAccess: Record<PageKey, UserRole[]>,
    newUserPageOverrides: UserPageOverride[],
  ) => {
    if (!token || user?.role !== 'Master') throw new Error('Only Master users can update permissions');
    const { response, data } = await fetchJsonWithTimeout<{
      error?: string;
      pageViewAccess?: Record<PageKey, UserRole[]>;
      pageEditAccess?: Record<PageKey, UserRole[]>;
      userPageOverrides?: UserPageOverride[];
    }>(
      API_URL + '/permissions/v2',
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ pageViewAccess: newPageViewAccess, pageEditAccess: newPageEditAccess, userPageOverrides: newUserPageOverrides }),
      },
      { timeoutMs: 60000 },
    );
    if (!response.ok) throw new Error((data as { error?: string })?.error || 'Failed to update permissions');
    if (data?.pageViewAccess) setPageViewAccess(data.pageViewAccess);
    if (data?.pageEditAccess) setPageEditAccess(data.pageEditAccess);
    if (data?.userPageOverrides) setUserPageOverrides(data.userPageOverrides);
    await loadPermissionsBundle();
  }, [authHeaders, loadPermissionsBundle, token, user?.role]);

  const canPerformAction = useCallback((actionKey: ActionKey) => {
    if (!user || user.status !== 'approved') return false;
    // Master is the supreme role: always allowed to perform any action (frontend gating).
    if (user.role === 'Master') return true;
    const allowedRoles = actionPermissions[actionKey] || [];
    const allowedEmails = actionEmailPermissions[actionKey] || [];
    const email = String(user.email || '').trim().toLowerCase();
    return allowedRoles.includes(user.role) || allowedEmails.includes(email);
  }, [actionEmailPermissions, actionPermissions, user]);

  const updateActionPermissions = useCallback(async (permissions: Record<ActionKey, UserRole[]>, emailPermissions?: Record<ActionKey, string[]>) => {
    if (!token || user?.role !== 'Master') {
      throw new Error('Only Master users can update action permissions');
    }
    if (!emailPermissions) {
      throw new Error('Missing action permissions payload');
    }

    const { response, data } = await fetchJsonWithTimeout<{ error?: string; permissions?: Record<ActionKey, UserRole[]>; emailPermissions?: Record<ActionKey, string[]> }>(
      API_URL + '/action-permissions',
      {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ permissions, emailPermissions }),
      },
      { timeoutMs: 25000 },
    );
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to update action permissions');
    }

    if (data?.permissions) setActionPermissions(data.permissions);
    if (data?.emailPermissions) setActionEmailPermissions(data.emailPermissions);
  }, [authHeaders, token, user?.role]);

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
        loginWithPassword,
        loginWithRolePassword,
        loginAsRole,
        pagePermissions,
        pageExcludePermissions,
        pageEmailPermissions,
        canAccessPage,
        canViewPage,
        canEditPage,
        pageViewAccess,
        pageEditAccess,
        userPageOverrides,
        pageEditActionMap,
        updatePagePermissions,
        updatePermissionsV2,
        reloadPagePermissions: reloadPermissionsBundle,
        actionPermissions,
        actionEmailPermissions,
        canPerformAction,
        updateActionPermissions,
        reloadActionPermissions: reloadPermissionsBundle,
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
