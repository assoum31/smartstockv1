import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidUsername } from "@/lib/identity";

export type MemberRole = "worker" | "manager" | "cashier" | "pricer";

const ROLE_OPTIONS: { role: MemberRole; label: string; hint: string; managerOnly?: boolean }[] = [
  { role: "manager", label: "مسير", hint: "كل الصلاحيات: الجرد، الفريق، المنتجات، البيع", managerOnly: true },
  { role: "cashier", label: "بائع / كاشير", hint: "نقطة البيع، سجل المبيعات، الموردين، وصول السلع" },
  { role: "worker", label: "عامل جرد", hint: "يمسح ويعدّ فقط" },
  { role: "pricer", label: "مصحح الأسعار", hint: "يعدّل أسعار المنتجات فقط" },
];

export function UsernameField({
  value,
  onChange,
  id = "member-username",
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>اسم المستخدم</Label>
      <Input
        id={id}
        required
        dir="ltr"
        autoCapitalize="none"
        placeholder="ex: ahmed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="barcode-chip h-11 text-start"
      />
      <p className="text-[11px] text-muted-foreground">
        حروف لاتينية صغيرة وأرقام، فريد داخل المتجر.
      </p>
    </div>
  );
}

export function MemberForm({
  onSubmit,
  submitLabel,
  allowManager,
}: {
  onSubmit: (v: {
    username: string;
    fullName: string;
    role: MemberRole;
  }) => Promise<string | null>;
  submitLabel: string;
  allowManager?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<MemberRole>("worker");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (!isValidUsername(username)) return setError("اسم المستخدم غير صالح.");
        setLoading(true);
        const err = await onSubmit({ username, fullName, role });
        setLoading(false);
        if (err) setError(err);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="member-name">الاسم الكامل</Label>
        <Input
          id="member-name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-11"
        />
      </div>
      <UsernameField value={username} onChange={setUsername} />
      <div className="space-y-1.5">
        <Label>الصلاحية</Label>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.filter((o) => allowManager || !o.managerOnly).map((o) => (
            <button
              key={o.role}
              type="button"
              onClick={() => setRole(o.role)}
              className={`rounded-xl border p-3 text-start text-sm font-bold transition-colors ${
                role === o.role
                  ? "border-primary bg-accent text-accent-foreground"
                  : "bg-card text-muted-foreground"
              }`}
            >
              {o.label}
              <span className="mt-0.5 block text-[11px] font-medium">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? "جاري الإنشاء..." : submitLabel}
      </Button>
    </form>
  );
}
