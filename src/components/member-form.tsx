import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidUsername } from "@/lib/identity";

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
    role: "worker" | "manager";
  }) => Promise<string | null>;
  submitLabel: string;
  allowManager?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"worker" | "manager">("worker");
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
      {allowManager && (
        <div className="space-y-1.5">
          <Label>الدور</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["worker", "manager"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-xl border p-3 text-start text-sm font-bold transition-colors ${
                  role === r
                    ? "border-primary bg-accent text-accent-foreground"
                    : "bg-card text-muted-foreground"
                }`}
              >
                {r === "worker" ? "عامل جرد" : "مسير"}
                <span className="mt-0.5 block text-[11px] font-medium">
                  {r === "worker" ? "يمسح ويعدّ فقط" : "يدير الجلسات والفريق والمنتجات"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? "جاري الإنشاء..." : submitLabel}
      </Button>
    </form>
  );
}
