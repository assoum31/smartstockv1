import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

/** Inline price editor: saves on blur / Enter through the store price function. */
export function PriceCell({
  barcode,
  purchase,
  selling,
  field,
  onSaved,
}: {
  barcode: string;
  purchase: number;
  selling: number;
  field: "purchase" | "selling";
  onSaved: () => void;
}) {
  const current = field === "purchase" ? purchase : selling;
  const [value, setValue] = useState(String(current));
  useEffect(() => setValue(String(current)), [current]);

  const save = async () => {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setValue(String(current));
      return void toast.error("سعر غير صالح.");
    }
    if (n === current) return;
    const { error } = await supabase.rpc("set_product_prices", {
      _barcode: barcode,
      _purchase: field === "purchase" ? n : purchase,
      _selling: field === "selling" ? n : selling,
    });
    if (error) {
      setValue(String(current));
      return void toast.error("تعذر حفظ السعر.");
    }
    toast.success("تم تحديث السعر");
    onSaved();
  };

  return (
    <Input
      dir="ltr"
      inputMode="decimal"
      aria-label={field === "purchase" ? "سعر الشراء" : "سعر البيع"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="h-8 w-24 text-end font-mono"
    />
  );
}
