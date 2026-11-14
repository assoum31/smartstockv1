import { describe, expect, it } from "vitest";
import { parseRelated, searchByName, suggestFor } from "@/lib/store-rules";
const all = [
  { barcode: "1", name: "مسمار", famille: "عتاد", related: ["3"] },
  { barcode: "2", name: "براغي", famille: "عتاد", related: [] },
  { barcode: "3", name: "مطرقة", famille: "أدوات", related: [] },
];
describe("store rules", () => {
  it("manual suggestions come first, then same family", () => {
    expect(suggestFor(all[0]!, all, new Set()).map((x) => x.barcode)).toEqual(["3", "2"]);
  });
  it("skips items already in the cart", () => {
    expect(suggestFor(all[0]!, all, new Set(["3"])).map((x) => x.barcode)).toEqual(["2"]);
  });
  it("name search is alphabetical", () => {
    expect(searchByName([{ name: "b x" }, { name: "a x" }], "x").map((x) => x.name)).toEqual(["a x", "b x"]);
  });
  it("related list drops self and duplicates", () => {
    expect(parseRelated("1, 2;2 3", "1")).toEqual(["2", "3"]);
  });
});
