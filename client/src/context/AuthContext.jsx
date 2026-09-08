import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('hookflow_token') || null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Initialize and verify authentication state on app boot
  useEffect(() => {
    const initAuth = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await apiService.getMe(token);
        if (response.success && response.user) {
          setUser(response.user);
        } else {
          logout();
        }
      } catch (err) {
        // Token invalid or expired
        logout();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Handle Login
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const response = await apiService.login({ email, password });
      if (response.success && response.token && response.user) {
        localStorage.setItem('hookflow_token', response.token);
        setToken(response.token);
        setUser(response.user);
        return { success: true };
      }
      return { success: false, message: response.message || 'Login failed' };
    } catch (err) {
      const msg = err.data?.message || err.message || 'Login failed';
      setAuthError(msg);
      return { success: false, message: msg };
    }
  };

  // Handle Registration
  const register = async (name, email, password) => {
    setAuthError(null);
    try {
      const response = await apiService.register({ name, email, password });
      if (response.success && response.token && response.user) {
        localStorage.setItem('hookflow_token', response.token);
        setToken(response.token);
        setUser(response.user);
        return { success: true };
      }
      return { success: false, message: response.message || 'Registration failed' };
    } catch (err) {
      const msg = err.data?.message || err.message || 'Registration failed';
      setAuthError(msg);
      return { success: false, message: msg };
    }
  };

  // Handle Logout
  const logout = () => {
    localStorage.removeItem('hookflow_token');
    setToken(null);
    setUser(null);
    setAuthError(null);
  };

  const value = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    loading,
    authError,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
