import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "nba_arch_token";
const USER_KEY  = "nba_arch_user";

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user,  setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  });
  // Güncel şartlar (Terms + Community Guidelines) kabul edildi mi — /me'den.
  // null = bilinmiyor; bant yalnız sunucu açıkça false dediğinde çıkar.
  const [termsCurrent, setTermsCurrent] = useState(null);

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

  // Kullanıcı (özellikle ROL) açılışta sunucudan tazelenir: admin yetkisi artık
  // panelden verilip alınıyor ve sunucu rolü her istekte DB'den okuyor. Cihazdaki
  // kopya eski kalırsa yeni admin paneli göremez, yetkisi alınan menüde görür.
  // Yukarıdaki fetch sarmalayıcısından SONRA tanımlı: 401 yine oturumu kapatır.
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!alive || !me?.id) return;
        const next = { id: me.id, email: me.email, username: me.username, role: me.role };
        localStorage.setItem(USER_KEY, JSON.stringify(next));
        setUser(next);
        setTermsCurrent(typeof me.terms_current === "boolean" ? me.terms_current : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  const isAdmin = user?.role === "admin";
  const isLoggedIn = !!token;

  const acceptTerms = async () => {
    const res = await fetch("/api/account/accept-terms", {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not save. Try again.");
    setTermsCurrent(true);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoggedIn, isAdmin, login, logout,
      termsCurrent: isLoggedIn ? termsCurrent : null, acceptTerms }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
