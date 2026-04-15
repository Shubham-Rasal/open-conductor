const STORAGE_KEY = "oc-color-scheme";

export type ColorScheme = "light" | "dark";

export function getColorScheme(): ColorScheme {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    }
  } catch {
    /* private mode */
  }
  return "dark";
}

export function setColorScheme(scheme: ColorScheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", scheme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    /* ignore */
  }
}

export function toggleColorScheme(): ColorScheme {
  const next: ColorScheme = getColorScheme() === "dark" ? "light" : "dark";
  setColorScheme(next);
  return next;
}
