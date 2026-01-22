import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type UserRole = 'Master' | 'Admin' | 'Basic';
export type UserStatus = 'approved' | 'pending' | 'rejected';

export interface User {
  email: string;
  role: UserRole;
  status: UserStatus;
  lastLogin?: Date;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isMaster: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isPending: boolean;
  logout: () => void;
  token: string | null;
  setAuthToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = import.meta.env.VITE_API_URL || '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const savedToken = sessionStorage.getItem('oauth_token');
        if (savedToken) {
          // Verify token with backend
          const response = await fetch(API_URL + '/auth/verify-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: savedToken }),
          });

          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            setToken(savedToken);
            if (data.user.status === 'pending') {
              setIsPending(true);
            }
          } else {
            // Token invalid, clear it
            sessionStorage.removeItem('oauth_token');
          }
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
    setIsPending(false);
    sessionStorage.removeItem('oauth_token');
    localStorage.removeItem('msal_account_filter');
  }, []);

  const setAuthToken = useCallback(async (newToken: string) => {
    try {
      // Verify token with backend
      const response = await fetch(API_URL + '/auth/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      const data = await response.json();
      setUser(data.user);
      setToken(newToken);
      sessionStorage.setItem('oauth_token', newToken);

      // Check if user is pending
      if (data.user.status === 'pending') {
        setIsPending(true);
        console.log('⏳ User pending approval:', data.user.email);
      } else {
        setIsPending(false);
        // Record login only if approved
        await fetch(API_URL + '/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + newToken,
          },
        });
      }
    } catch (error) {
      console.error('Token validation error:', error);
      throw error;
    }
  }, []);

  const isAuthenticated = user !== null && token !== null;
  const isMaster = user?.role === 'Master' && user?.status === 'approved';
  const isAdmin = (user?.role === 'Admin' || user?.role === 'Master') && user?.status === 'approved';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isMaster,
        isAdmin,
        isLoading,
        isPending,
        logout,
        token,
        setAuthToken,
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
