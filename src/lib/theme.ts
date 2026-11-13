import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "oled" | "system";
const KEY = "smartstock:theme";
let pref: ThemePref = "light";
const subs = new Set<() => void>();
let mql: MediaQueryList | null = null;

function apply() {
  if (typeof document === "undefined") return;
  const dark = pref === "dark" || pref === "oled" || (pref === "system" && !!mql?.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("oled", pref === "oled");
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
function emit() { apply(); subs.forEach((f) => f()); }

/** Call once from a useEffect: loads the saved choice and follows the device when "system". */
export function initTheme() {
  try {
    const v = localStorage.getItem(KEY);
    pref = v === "dark" || v === "oled" || v === "system" ? v : "light";
  } catch {}
  mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", apply);
  emit();
}
export function setTheme(p: ThemePref) {
  pref = p;
  try { localStorage.setItem(KEY, p); } catch {}
  emit();
}
export function useTheme(): ThemePref {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => pref, () => "light");
}
