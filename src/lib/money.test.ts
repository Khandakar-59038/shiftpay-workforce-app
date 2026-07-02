import { describe, expect, it } from "vitest";
import { formatCents } from "./money";

describe("formatCents", () => {
  it("formats USD with thousands separators", () => {
    expect(formatCents(123_456, "USD")).toBe("$1,234.56");
  });
  it("formats BDT with the taka symbol", () => {
    expect(formatCents(5_000, "BDT")).toBe("৳50.00");
  });
  it("formats negative amounts", () => {
    expect(formatCents(-1_500, "USD")).toBe("-$15.00");
  });
});
