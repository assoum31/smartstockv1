import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface LabelProduct {
  barcode: string;
  name: string;
  selling_price: number | string;
}

const PRESETS = [
  { w: 40, h: 20 },
  { w: 50, h: 30 },
  { w: 40, h: 25 },
  { w: 58, h: 40 },
  { w: 30, h: 20 },
];
const STORAGE_KEY = "stocki-label-size";

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function LabelPrintDialog({
  products,
  open,
  onOpenChange,
}: {
  products: LabelProduct[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [w, setW] = useState(40);
  const [h, setH] = useState(20);
  const [copies, setCopies] = useState(1);
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.w && saved?.h) {
        setW(saved.w);
        setH(saved.h);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const print = async () => {
    if (w < 15 || h < 10) return void toast.error("المقاس صغير جداً");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ w, h }));
    const { default: JsBarcode } = await import("jsbarcode");
    const textLines = (showName ? 1 : 0) + (showPrice ? 1 : 0);
    const barH = Math.max(h - 4 - textLines * 3.2 - 3, 5);
    const labels: string[] = [];
    for (const p of products) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      try {
        JsBarcode(svg, p.barcode, {
          format: /^\d{13}$/.test(p.barcode) ? "EAN13" : "CODE128",
          displayValue: true,
          fontSize: 14,
          margin: 0,
          height: 60,
        });
      } catch {
        JsBarcode(svg, p.barcode, { format: "CODE128", displayValue: true, fontSize: 14, margin: 0, height: 60 });
      }
      svg.setAttribute("preserveAspectRatio", "none");
      const html = `<div class="l">${showName ? `<div class="n">${esc(p.name)}</div>` : ""}<div class="b">${svg.outerHTML}</div>${
        showPrice ? `<div class="p">${Number(p.selling_price) || 0} دج</div>` : ""
      }</div>`;
      for (let i = 0; i < Math.max(1, copies); i++) labels.push(html);
    }
    const win = window.open("", "_blank");
    if (!win) return void toast.error("اسمح بالنوافذ المنبثقة للطباعة");
    win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>ملصقات</title><style>
@page{size:${w}mm ${h}mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif}
.l{width:${w}mm;height:${h}mm;padding:1.5mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;page-break-after:always;break-after:page}
.n{font-size:2.6mm;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;line-height:1.2}
.p{font-size:3mm;font-weight:bold;line-height:1.2}
.b{width:100%;height:${barH}mm}.b svg{width:100%;height:100%}
</style></head><body>${labels.join("")}<script>window.onload=()=>{window.print();}</script></body></html>`);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            طباعة ملصقات الباركود
          </DialogTitle>
          <DialogDescription>
            {products.length === 1 ? products[0].name : `${products.length} منتج`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">المقاس (العرض × الارتفاع بالملم)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((s) => (
                <Button
                  key={`${s.w}x${s.h}`}
                  size="sm"
                  variant={w === s.w && h === s.h ? "default" : "outline"}
                  onClick={() => {
                    setW(s.w);
                    setH(s.h);
                  }}
                >
                  {s.w}×{s.h}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">العرض</Label>
              <Input type="number" value={w} onChange={(e) => setW(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">الارتفاع</Label>
              <Input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">النسخ لكل منتج</Label>
              <Input type="number" min={1} value={copies} onChange={(e) => setCopies(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
              الاسم
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
              سعر البيع
            </label>
          </div>
          <Button className="w-full" size="lg" disabled={products.length === 0} onClick={print}>
            <Printer />
            طباعة {products.length * Math.max(1, copies)} ملصق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
