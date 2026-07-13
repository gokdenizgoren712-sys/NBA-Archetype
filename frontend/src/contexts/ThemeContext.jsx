import { createContext, useContext, useEffect } from "react";

/* Primary Arch dark-committed — light tema kaldırıldı. */
const ThemeContext = createContext({ theme: "dark" });

export function ThemeProvider({ children }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    root.classList.remove("light");
    document.body.style.background = "#0b0b0b";
    document.body.style.color = "#e5e5e5";
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
