import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "nba_arch_token";
const USER_KEY  = "nba_arch_user";

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user,  setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  });

  const login = (tokenStr, userData) => {
    localStorage.setItem(TOKEN_KEY, tokenStr);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(tokenStr);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  };

  const isAdmin = user?.role === "admin";
  const isLoggedIn = !!token;

  return (
    <AuthContext.Provider value={{ token, user, isLoggedIn, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
