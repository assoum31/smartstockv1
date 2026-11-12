import { describe, expect, it } from "vitest";
import { translateString } from "@/lib/dom-translate";

describe("screen translation", () => {
  it("translates a whole phrase to French and English", () => {
    expect(translateString("سعر البيع", "fr")).toBe("Prix de vente");
    expect(translateString("سعر البيع", "en")).toBe("Selling price");
  });
  it("keeps Arabic when the language is Arabic", () => {
    expect(translateString("سعر البيع", "ar")).toBe("سعر البيع");
  });
  it("translates phrases mixed with numbers", () => {
    expect(translateString("12 منتج", "en")).toBe("12 product");
  });
});
