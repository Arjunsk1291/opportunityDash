import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type UserRole = 'master' | 'admin' | 'basic';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isMaster: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  getAllUsers: () => User[];
  updateUserRole: (userId: string, newRole: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Master user and initial demo users
const INITIAL_USERS: { email: string; password: string; user: User }[] = [
  {
    email: 'master@example.com',
    password: 'master123',
    user: {
      id: '0',
      email: 'master@example.com',
      displayName: 'Master User',
      role: 'master',
    },
  },
  {
    email: 'admin@example.com',
    password: 'admin123',
    user: {
      id: '1',
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'admin',
    },
  },
  {
    email: 'user@example.com',
    password: 'user123',
    user: {
      id: '2',
      email: 'user@example.com',
      displayName: 'Basic User',
      role: 'basic',
    },
  },
];

function loadUsers(): typeof INITIAL_USERS {
  const saved = localStorage.getItem('demo_users');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return INITIAL_USERS;
    }
  }
  return INITIAL_USERS;
}

function persistUsers(users: typeof INITIAL_USERS) {
  localStorage.setItem('demo_users', JSON.stringify(users));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<typeof INITIAL_USERS>(loadUsers);
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    persistUsers(users);
  }, [users]);

  const login = useCallback((email: string, password: string): { success: boolean; error?: string } => {
    const foundUser = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (foundUser) {
      setUser(foundUser.user);
      localStorage.setItem('auth_user', JSON.stringify(foundUser.user));
      return { success: true };
    }

    return { success: false, error: 'Invalid email or password' };
  }, [users]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('auth_user');
    sessionStorage.removeItem('adminAuthenticated');
  }, []);

  const getAllUsers = useCallback((): User[] => {
    return users.map((u) => u.user);
  }, [users]);

  const updateUserRole = useCallback((userId: string, newRole: UserRole) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.user.id === userId ? { ...u, user: { ...u.user, role: newRole } } : u
      )
    );
    // If the current user's role was changed, update them too
    setUser((current) => {
      if (current && current.id === userId) {
        const updated = { ...current, role: newRole };
        localStorage.setItem('auth_user', JSON.stringify(updated));
        return updated;
      }
      return current;
    });
  }, []);

  const isAuthenticated = user !== null;
  const isMaster = user?.role === 'master';
  const isAdmin = user?.role === 'admin' || user?.role === 'master';

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isMaster, isAdmin, login, logout, getAllUsers, updateUserRole }}>
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
