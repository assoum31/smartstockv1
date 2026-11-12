import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PinInfo {
  storeCode: string;
  username: string;
  pin: string | null;
  expiresAt: string | null;
  fullName?: string;
}

/** Shows a one-time activation PIN. It is never shown again after closing. */
export function PinReveal({ info, onClose }: { info: PinInfo | null; onClose: () => void }) {
  const text = info
    ? `SMART STOCK\nرمز المتجر: ${info.storeCode}\nاسم المستخدم: ${info.username}\nرمز التفعيل: ${info.pin}`
    : "";
  return (
    <Dialog open={Boolean(info)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            رمز التفعيل {info?.fullName ? `— ${info.fullName}` : ""}
          </DialogTitle>
          <DialogDescription>
            أعطِ هذه المعلومات للشخص. يدخل بها مرة واحدة ثم يختار كلمة المرور الخاصة به. لن يظهر
            الرمز مرة أخرى.
          </DialogDescription>
        </DialogHeader>
        {info && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-ink p-5 text-center text-ink-foreground">
              <p className="text-xs text-ink-muted">رمز التفعيل</p>
              <p className="barcode-chip mt-1 text-4xl font-bold tracking-[0.35em]">{info.pin}</p>
              {info.expiresAt && (
                <p className="mt-2 text-[11px] text-ink-muted">
                  صالح حتى {new Date(info.expiresAt).toLocaleDateString("fr-FR")}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="surface-card p-3">
                <dt className="text-xs text-muted-foreground">رمز المتجر</dt>
                <dd className="barcode-chip mt-0.5 font-bold">{info.storeCode}</dd>
              </div>
              <div className="surface-card p-3">
                <dt className="text-xs text-muted-foreground">اسم المستخدم</dt>
                <dd className="barcode-chip mt-0.5 font-bold">{info.username}</dd>
              </div>
            </dl>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(() => toast.success("تم النسخ"));
            }}
          >
            <Copy />
            نسخ المعلومات
          </Button>
          <Button onClick={onClose}>تم</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
