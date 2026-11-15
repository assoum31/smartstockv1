// The Windows app opens the site with ?desktop=1; remember it so the device
// stays a single-store desktop install (no master page, store code locked).
const FLAG = "smartstock_desktop";
const STORE = "smartstock_desktop_store";

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("desktop") === "1") localStorage.setItem(FLAG, "1");
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}
export const desktopStore = () => (typeof window === "undefined" ? null : localStorage.getItem(STORE));
export const lockDesktopStore = (code: string) => { if (isDesktopApp()) localStorage.setItem(STORE, code); };
export const unlockDesktopStore = () => localStorage.removeItem(STORE);
