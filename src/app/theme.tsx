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
  resolvedTheme: "light" | "dark";
  setTheme: (value: Theme) => void;
  storageError: boolean;
}>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
  storageError: false,
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setValue] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem(key);
      return value === "light" || value === "dark" || value === "system"
        ? value
        : "light";
    } catch {
      return "light";
    }
  });
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        theme === "dark" || (theme === "system" && preference.matches);
      document.documentElement.classList.toggle("dark", dark);
      setResolvedTheme(dark ? "dark" : "light");
    };
    apply();
    preference.addEventListener("change", apply);
    return () => preference.removeEventListener("change", apply);
  }, [theme]);
  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
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
