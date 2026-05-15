import { describe, expect, it } from "vitest";
import {
  formatCompactLocationBarcode,
  isReceiveAssetTag,
  normalizeReceiveAssetTag,
  parseCompactLocationBarcode,
} from "@/lib/scan-flow";
import { scanFlowProgress } from "@/lib/tech-scan-flow";

describe("scan-flow receive helpers", () => {
  it("normalizes asset tag case", () => {
    expect(normalizeReceiveAssetTag("c0009001")).toBe("C0009001");
  });

  it("validates asset tag pattern", () => {
    expect(isReceiveAssetTag("C0009001")).toBe(true);
    expect(isReceiveAssetTag("x0009001")).toBe(false);
  });

  it("formatCompactLocationBarcode joins with slashes", () => {
    expect(formatCompactLocationBarcode("Lab-Building-A", "Receiving", "DOCK-2")).toBe(
      "Lab-Building-A/Receiving/DOCK-2",
    );
    expect(formatCompactLocationBarcode(" A ", " B ", " C ")).toBe("A/B/C");
  });

  it("parses compact location with slashes", () => {
    const r = parseCompactLocationBarcode("Lab-Building-A/Receiving/DOCK-2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.location).toEqual({
        site: "Lab-Building-A",
        room: "Receiving",
        row: null,
        rack: "DOCK-2",
        ru: null,
      });
    }
  });

  it("rejects pipe delimiter (slash-only contract)", () => {
    const r = parseCompactLocationBarcode("Lab-Building-A|Storage-1|SHELF-9");
    expect(r.ok).toBe(false);
  });

  it("rejects compact location without three segments", () => {
    const r = parseCompactLocationBarcode("Lab-Building-A/Receiving");
    expect(r.ok).toBe(false);
  });

  it("rejects extra path segments", () => {
    const r = parseCompactLocationBarcode("Lab-Building-A/Receiving/DOCK-2/extra");
    expect(r.ok).toBe(false);
  });

  it("rejects empty middle segment", () => {
    const r = parseCompactLocationBarcode("Lab-Building-A//DOCK-2");
    expect(r.ok).toBe(false);
  });

  it("scanFlowProgress is 1-based", () => {
    expect(scanFlowProgress(0, 3)).toEqual({ current: 1, total: 3 });
    expect(scanFlowProgress(2, 5)).toEqual({ current: 3, total: 5 });
  });
});
