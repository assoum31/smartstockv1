import { describe, expect, it, vi } from "vitest";
import {
  assertExcelLimits,
  MAX_EXCEL_FILE_BYTES,
  MAX_EXCEL_ROWS,
  readSheetAsText,
} from "@/lib/excel";

describe("Excel import limits", () => {
  it("rejects 5 MB plus 1 byte before reading the file", async () => {
    const arrayBuffer = vi.fn();
    const file = { size: MAX_EXCEL_FILE_BYTES + 1, arrayBuffer } as unknown as File;

    await expect(readSheetAsText(file)).rejects.toThrow("أكبر من 5 ميغابايت");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects 20001 rows", () => {
    expect(() => assertExcelLimits(100, 20_001)).toThrow("أكثر من 20000 سطر");
  });

  it("accepts exactly 20000 rows and a file of exactly 5 MB", () => {
    expect(MAX_EXCEL_ROWS).toBe(20_000);
    expect(() => assertExcelLimits(MAX_EXCEL_FILE_BYTES, 20_000)).not.toThrow();
  });
});
