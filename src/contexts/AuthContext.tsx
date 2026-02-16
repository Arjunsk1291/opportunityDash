import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

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
  logout: () => void;
  token: string | null;
  loginWithUsername: (username: string) => Promise<void>;
  getAllUsers: () => User[];
  updateUserRole: (userId: string, newRole: UserRole, assignedGroup?: string) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = import.meta.env.VITE_API_URL || '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);

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
  }, [authHeaders, token]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const savedUsername = sessionStorage.getItem('username_token');
        if (!savedUsername) return;

        const response = await fetch(API_URL + '/auth/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: savedUsername }),
        });

        if (!response.ok) {
          sessionStorage.removeItem('username_token');
          return;
        }

        const data = await response.json();
        const nextUser: User = {
          email: data.user.email,
          displayName: data.user.displayName || data.user.email,
          role: data.user.role,
          status: data.user.status,
          assignedGroup: data.user.assignedGroup || null,
        };
        setUser(nextUser);
        setToken(savedUsername);
        setIsPending(nextUser.status === 'pending');

        if (nextUser.status === 'approved') {
          await fetch(API_URL + '/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + savedUsername,
            },
          });
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setAllUsers([]);
    setIsPending(false);
    sessionStorage.removeItem('username_token');
  }, []);

  const loginWithUsername = useCallback(async (username: string) => {
    const normalizedUsername = username.trim().toLowerCase();
    const response = await fetch(API_URL + '/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalizedUsername }),
    });

    const data = await response.json();
    if (!response.ok) {
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
    sessionStorage.setItem('username_token', normalizedUsername);

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

  const getAllUsers = useCallback(() => allUsers, [allUsers]);

  const fetchUsers = useCallback(async () => {
    if (!token || user?.role !== 'Master') return;
    const response = await fetch(API_URL + '/users/authorized', { headers: authHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    setAllUsers(data.map((u: any) => ({
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
        logout,
        token,
        loginWithUsername,
        getAllUsers,
        updateUserRole,
        refreshCurrentUser,
      }}
    >
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
