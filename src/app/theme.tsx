import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export type Theme = "light" | "dark" | "system";
const key = "travelbuddy-v1.1-theme";
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (value: Theme) => void;
  storageError: boolean;
}>({ theme: "system", setTheme: () => {}, storageError: false });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setValue] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem(key);
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && preference.matches),
      );
    };
    apply();
    preference.addEventListener("change", apply);
    return () => preference.removeEventListener("change", apply);
  }, [theme]);
  return (
    <ThemeContext.Provider
      value={{
        theme,
        storageError,
        setTheme: (value) => {
          setValue(value);
          try {
            localStorage.setItem(key, value);
          } catch {
            setStorageError(true);
          }
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
