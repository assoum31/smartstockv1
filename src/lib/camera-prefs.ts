const KEY = "smartstock.camera";
type Prefs = { enabled: boolean; deviceId: string | null };
export function getCameraPrefs(): Prefs {
  try { return { enabled: true, deviceId: null, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { enabled: true, deviceId: null }; }
}
export function setCameraPrefs(p: Partial<Prefs>) {
  localStorage.setItem(KEY, JSON.stringify({ ...getCameraPrefs(), ...p }));
}
export type CamPermission = "granted" | "denied" | "prompt" | "unsupported";
export async function queryCameraPermission(): Promise<CamPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const r = await navigator.permissions.query({ name: "camera" as PermissionName });
    return r.state as CamPermission;
  } catch { return "prompt"; }
}
/** Shows the browser's permission prompt from inside the app. */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    s.getTracks().forEach((t) => t.stop());
    return true;
  } catch { return false; }
}
