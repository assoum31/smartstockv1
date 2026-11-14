import { useEffect, useState } from "react";
import { Camera, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Html5Qrcode, type CameraDevice } from "html5-qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getCameraPrefs, setCameraPrefs, queryCameraPermission, requestCameraPermission, type CamPermission } from "@/lib/camera-prefs";

export function CameraSettingsCard() {
  const [perm, setPerm] = useState<CamPermission>("prompt");
  const [enabled, setEnabled] = useState(true);
  const [deviceId, setDeviceId] = useState<string>("");
  const [cams, setCams] = useState<CameraDevice[]>([]);

  const refresh = async () => {
    const p = await queryCameraPermission();
    setPerm(p);
    if (p === "granted") {
      try { setCams(await Html5Qrcode.getCameras()); } catch { /* ignore */ }
    }
  };
  useEffect(() => {
    const pr = getCameraPrefs();
    setEnabled(pr.enabled);
    setDeviceId(pr.deviceId ?? "");
    void refresh();
  }, []);

  const grant = async () => {
    const ok = await requestCameraPermission();
    if (ok) toast.success("تم منح صلاحية الكاميرا.");
    else toast.error("تم رفض الصلاحية. افتح إعدادات الموقع في المتصفح (رمز القفل بجانب العنوان) واسمح بالكاميرا.");
    await refresh();
  };

  const Icon = perm === "granted" ? ShieldCheck : perm === "denied" ? ShieldAlert : ShieldQuestion;
  const label = { granted: "مسموحة", denied: "محظورة", prompt: "لم تُمنح بعد", unsupported: "غير مدعومة في هذا الجهاز" }[perm];

  return (
    <div className="surface-card space-y-5 p-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><Camera className="h-5 w-5 text-primary" />الكاميرا والماسح</h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div className="flex items-center gap-2">
          <Icon className={perm === "granted" ? "h-5 w-5 text-primary" : "h-5 w-5 text-destructive"} />
          <span className="font-bold">صلاحية الكاميرا: {label}</span>
        </div>
        {perm !== "granted" && perm !== "unsupported" && (
          <Button onClick={grant}>منح صلاحية الكاميرا الآن</Button>
        )}
      </div>
      {perm === "denied" && (
        <p className="text-sm text-muted-foreground">
          الصلاحية محظورة: اضغط على رمز القفل بجانب عنوان الموقع ← الأذونات ← الكاميرا ← سماح، ثم اضغط "منح صلاحية الكاميرا الآن".
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">استعمال الكاميرا في التطبيق</p>
          <p className="text-sm text-muted-foreground">أوقفها إذا كنت تستعمل ماسحا خارجيا أو الإدخال اليدوي.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setCameraPrefs({ enabled: v }); toast.success("تم الحفظ."); }} />
      </div>
      {perm === "granted" && cams.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-bold">الكاميرا الافتراضية</p>
          <select
            className="w-full rounded-lg border border-input bg-background p-2"
            value={deviceId}
            onChange={(e) => { setDeviceId(e.target.value); setCameraPrefs({ deviceId: e.target.value || null }); toast.success("تم الحفظ."); }}
          >
            <option value="">اختيار تلقائي</option>
            {cams.map((c, i) => <option key={c.id} value={c.id}>{c.label || `كاميرا ${i + 1}`}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
