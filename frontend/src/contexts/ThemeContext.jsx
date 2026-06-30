import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("nba_theme") || "dark";
    // İlk render öncesi class'ı hemen uygula (flash önleme)
    const root = document.documentElement;
    root.classList.add(saved);
    root.classList.remove(saved === "dark" ? "light" : "dark");
    return saved;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
      document.body.style.background = "#d4d8e8";
      document.body.style.color = "#141720";
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
      document.body.style.background = "#030307";
      document.body.style.color = "#eef0f5";
    }
  }, [theme]);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    localStorage.setItem("nba_theme", next);
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
