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

  // Her sayfa kendi fetch'ini kendi Authorization header'ıyla atıyor (tek bir
  // authFetch sarmalayıcı yok, ~15 dosyaya dağılmış) — bu yüzden süresi dolmuş
  // token'ı TEK yerden yakalamak için window.fetch'i bir kez sarmalıyoruz.
  // Yalnızca Authorization header'ı GÖNDERİLMİŞ isteklerde 401 görürsek
  // oturumu kapatıp /login'e yönlendiriyoruz — /api/auth/login gibi
  // credential-doğrulama 401'leri (yanlış şifre) Authorization header
  // taşımadığı için buna karışmaz.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (res.status === 401 && args[1]?.headers?.Authorization) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login?expired=1";
        }
      }
      return res;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

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
