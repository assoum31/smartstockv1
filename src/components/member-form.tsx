import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isValidUsername } from "@/lib/identity";

export type MemberRole = "worker" | "manager" | "cashier" | "pricer";

export const ROLE_OPTIONS: { role: MemberRole; label: string; hint: string; managerOnly?: boolean }[] = [
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
        <RoleSelect value={role} onChange={setRole} allowManager={Boolean(allowManager)} />
      </div>
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? "جاري الإنشاء..." : submitLabel}
      </Button>
    </form>
  );
}

export function RoleSelect({
  value,
  onChange,
  allowManager,
}: {
  value: MemberRole;
  onChange: (r: MemberRole) => void;
  allowManager?: boolean;
}) {
  const opts = ROLE_OPTIONS.filter((o) => allowManager || !o.managerOnly);
  const current = ROLE_OPTIONS.find((o) => o.role === value);
  return (
    <>
      <Select value={value} onValueChange={(v) => onChange(v as MemberRole)}>
        <SelectTrigger className="h-11" dir="rtl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent dir="rtl">
          {opts.map((o) => (
            <SelectItem key={o.role} value={o.role}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && <p className="text-[11px] text-muted-foreground">{current.hint}</p>}
    </>
  );
}
