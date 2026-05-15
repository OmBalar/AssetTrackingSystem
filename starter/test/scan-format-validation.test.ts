import { describe, expect, it } from "vitest";
import {
  formatReceiveEquipmentQr,
  isValidAssetTagPayload,
  isValidCompactLocationPayload,
  isValidCustodianBadgePayload,
  isValidSerialPayload,
  looksLikeCompactLocationBarcode,
  parseReceiveAssetTypeField,
  parseReceiveEquipmentQr,
} from "@/lib/scan-format-validation";

describe("scan-format-validation", () => {
  it("accepts asset tag payloads", () => {
    expect(isValidAssetTagPayload("C0009001")).toBe(true);
    expect(isValidAssetTagPayload("c0009001")).toBe(true);
    expect(isValidAssetTagPayload("X0009001")).toBe(false);
    expect(isValidAssetTagPayload("C000900")).toBe(false);
  });

  it("accepts serial payloads but rejects asset-tag-shaped values", () => {
    expect(isValidSerialPayload("SN-INST-A005")).toBe(true);
    expect(isValidSerialPayload("MFR-7XK2-009144")).toBe(true);
    expect(isValidSerialPayload("ABC123")).toBe(true);
    expect(isValidSerialPayload("C0009001")).toBe(false);
    expect(isValidSerialPayload("")).toBe(false);
  });

  it("detects compact location QR payloads", () => {
    expect(isValidCompactLocationPayload("Lab-Building-A/Receiving/DOCK-2")).toBe(true);
    expect(isValidCompactLocationPayload("Lab-Building-A/Receiving")).toBe(false);
    expect(looksLikeCompactLocationBarcode("Lab-Building-A/Receiving/DOCK-2")).toBe(true);
    expect(looksLikeCompactLocationBarcode("Lab-Building-A")).toBe(false);
  });

  it("parses receive equipment QR payloads", () => {
    const v = formatReceiveEquipmentQr("SN-A", "Co", "Mod", "instrument");
    const r = parseReceiveEquipmentQr(v);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.serial).toBe("SN-A");
      expect(r.manufacturer).toBe("Co");
      expect(r.model).toBe("Mod");
      expect(r.asset_class).toBe("instrument");
    }
  });

  it("rejects equipment QR without EQ prefix", () => {
    const r = parseReceiveEquipmentQr("SN-A|Co|Mod|instrument");
    expect(r.ok).toBe(false);
  });

  it("rejects equipment QR with wrong field count", () => {
    const r = parseReceiveEquipmentQr("EQ:SN-A|Co|Mod");
    expect(r.ok).toBe(false);
  });

  it("rejects asset-tag-shaped serial in equipment QR", () => {
    const r = parseReceiveEquipmentQr("EQ:C0009001|Co|Mod|instrument");
    expect(r.ok).toBe(false);
  });

  it("parses manual receive asset type field", () => {
    expect(parseReceiveAssetTypeField("instrument")).toEqual({ ok: true, asset_class: "instrument" });
    expect(parseReceiveAssetTypeField("COMPUTE")).toEqual({ ok: true, asset_class: "compute" });
    expect(parseReceiveAssetTypeField("network")).toEqual({ ok: true, asset_class: "network" });
  });

  it("rejects unknown asset type field", () => {
    expect(parseReceiveAssetTypeField("laptop").ok).toBe(false);
  });

  it("accepts custodian badge payloads", () => {
    expect(isValidCustodianBadgePayload("tech-jane")).toBe(true);
    expect(isValidCustodianBadgePayload("manager-paul")).toBe(true);
    expect(isValidCustodianBadgePayload("tech")).toBe(false);
    expect(isValidCustodianBadgePayload("")).toBe(false);
  });
});
