"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, CameraDevice } from "html5-qrcode";
import { RefreshCw } from "lucide-react";
import { getCameraPrefs, requestCameraPermission } from "@/lib/camera-prefs";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  torchOn?: boolean;
  onTorchSupport?: (supported: boolean) => void;
}

export function BarcodeScanner({ onDetected, torchOn = false, onTorchSupport }: BarcodeScannerProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "barcode-scanner-view";
  const [attempt, setAttempt] = useState(0);

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.error("Failed to stop camera:", e);
      }
    }
  };

  const startCamera = useCallback(
    async (cameraId: string) => {
      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(containerId);
        }

        await stopCamera();

        await scannerRef.current.start(
          cameraId,
          {
            fps: 15,
            qrbox: { width: 220, height: 140 },
            aspectRatio: 1.333,
          },
          (decodedText) => {
            if (navigator.vibrate) navigator.vibrate(80);
            onDetected(decodedText);
          },
          () => {
            // ignore
          },
        );

        setIsStarted(true);
        setErrorMsg(null);
        try {
          const caps = scannerRef.current.getRunningTrackCapabilities() as { torch?: boolean };
          onTorchSupport?.(Boolean(caps.torch));
        } catch {
          onTorchSupport?.(false);
        }
      } catch (err: unknown) {
        console.error("Camera Init Error:", err);
        setErrorMsg("تعذر تشغيل الكاميرا. يرجى التأكد من إعطاء صلاحية الكاميرا للمتصفح.");
      }
    },
    [onDetected, onTorchSupport],
  );

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!getCameraPrefs().enabled) {
        setErrorMsg("الكاميرا متوقفة من إعدادات التطبيق (الإعدادات ← الكاميرا).");
        return;
      }
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!devices || devices.length === 0) {
          setErrorMsg("لم يتم العثور على كاميرا في هذا الجهاز.");
          return;
        }

        const backCams = devices.filter((device) => {
          const label = device.label.toLowerCase();
          return (
            label.includes("back") ||
            label.includes("rear") ||
            label.includes("environment") ||
            label.includes("خلفية")
          );
        });

        const targetCameras = backCams.length > 0 ? backCams : devices;
        setCameras(targetCameras);

        // Find main 1x camera
        let mainIdx = targetCameras.findIndex((device) => {
          const label = device.label.toLowerCase();
          const isWideOrMacro =
            label.includes("wide") ||
            label.includes("ultra") ||
            label.includes("0.5") ||
            label.includes("macro") ||
            label.includes("depth");
          return !isWideOrMacro;
        });

        // If no main 1x camera, pick the last one (common pattern on Android)
        if (mainIdx === -1 && backCams.length > 0) {
          mainIdx = backCams.length - 1;
        }

        // If still -1, default to 0
        let selectedIdx = mainIdx !== -1 ? mainIdx : 0;
        const pref = getCameraPrefs().deviceId;
        const all = targetCameras;
        if (pref) {
          const i = all.findIndex((d) => d.id === pref);
          if (i >= 0) selectedIdx = i;
          else {
            const d = devices.find((x) => x.id === pref);
            if (d) { all.unshift(d); selectedIdx = 0; setCameras([...all]); }
          }
        }

        setActiveCameraIndex(selectedIdx);

        if (isMounted) {
          await startCamera(targetCameras[selectedIdx]!.id);
        }
      } catch (err: unknown) {
        console.error("Camera Init Error:", err);
        setErrorMsg("تعذر تشغيل الكاميرا. يرجى التأكد من إعطاء صلاحية الكاميرا للمتصفح.");
      }
    }

    init();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [startCamera, attempt]);

  useEffect(() => {
    const s = scannerRef.current;
    if (!isStarted || !s?.isScanning) return;
    s.applyVideoConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] }).catch(
      () => onTorchSupport?.(false),
    );
  }, [torchOn, isStarted, onTorchSupport]);

  const toggleLens = () => {
    if (cameras.length > 1) {
      const nextIndex = (activeCameraIndex + 1) % cameras.length;
      setActiveCameraIndex(nextIndex);
      startCamera(cameras[nextIndex]!.id);
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800">
      {errorMsg ? (
        <div className="p-6 text-center text-sm text-red-400">
          <p>{errorMsg}</p>
          {getCameraPrefs().enabled && (
            <button
              type="button"
              onClick={async () => { await requestCameraPermission(); setErrorMsg(null); setAttempt((a) => a + 1); }}
              className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              منح الصلاحية وتشغيل الكاميرا
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* حاوية الكاميرا */}
          <div id={containerId} className="w-full min-h-[260px] bg-black" />

          {/* مؤشر بصري لمنطقة مسح الباركود */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-36 border-2 border-dashed border-amber-500/70 rounded-xl" />
          </div>

          {cameras.length > 1 && (
            <button
              onClick={toggleLens}
              className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white backdrop-blur-md"
            >
              <RefreshCw className="h-4 w-4" />
              تبديل العدسة
            </button>
          )}
        </div>
      )}
    </div>
  );
}
