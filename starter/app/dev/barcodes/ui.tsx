"use client";

import type { ReactNode } from "react";
import { QrCodeDisplay } from "@/components/QrCodeDisplay";
import {
  COMPACT_LOCATION_BARCODE_EXAMPLE,
  COMPACT_LOCATION_BARCODE_LABEL,
  DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE,
  DEPLOY_COMPACT_LOCATION_BARCODE_LABEL,
  formatCompactLocationBarcode,
  formatDeployLocationBarcode,
} from "@/lib/scan-flow";
import { formatReceiveEquipmentQr } from "@/lib/scan-format-validation";

function QrTile({
  label,
  value,
  note,
  size = 168,
}: {
  label: string;
  value: string;
  note?: string;
  size?: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold leading-snug text-gray-900">{label}</p>
      <div className="mt-3 flex justify-center">
        <QrCodeDisplay value={value} size={size} />
      </div>
      <p className="mt-3 break-all font-mono text-xs font-semibold text-gray-900 sm:text-sm">{value}</p>
      {note ? <p className="mt-1.5 text-xs leading-snug text-gray-600">{note}</p> : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-12 scroll-mt-6">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const receiveDockLocation = formatCompactLocationBarcode("Lab-Building-A", "Receiving", "DOCK-2");

const RECEIVE_SAMPLE_TAG = "C0009001";
const RECEIVE_SAMPLE_EQUIPMENT = formatReceiveEquipmentQr(
  "SN-RECV-DEV-01",
  "BioSystems Inc",
  "Genomics Sequencer 2000",
  "instrument",
);

const LOC = {
  dock2: receiveDockLocation,
  shelf3: formatCompactLocationBarcode("Lab-Building-A", "Storage-1", "SHELF-3"),
  bayRack: formatCompactLocationBarcode("Lab-Building-A", "Bay-12", "B-04"),
  buildingBCompute: formatCompactLocationBarcode("Lab-Building-B", "Computing-1", "C-12"),
  storageB: formatCompactLocationBarcode("Lab-Building-B", "Storage-2", "SHELF-1"),
  rmaBin: formatCompactLocationBarcode("Lab-Building-A", "Staging-RMA", "BIN-RMA-1"),
  disposal: formatCompactLocationBarcode("Lab-Building-A", "Disposal", "PALLET-9"),
  telecom: formatCompactLocationBarcode("Lab-Building-A", "Telecom-1", "T-01"),
} as const;

const deployBayB04U16 = formatDeployLocationBarcode("Lab-Building-A", "Bay-12", "Aisle-3", "B-04", "U16");
const deployDockP02 = formatDeployLocationBarcode("Lab-Building-A", "Receiving", "Aisle-1", "DOCK-2", "P-02");
const deployShelfRu = formatDeployLocationBarcode("Lab-Building-A", "Storage-1", "Aisle-2", "SHELF-3", "U08");
const deployBuildingBC12 = formatDeployLocationBarcode("Lab-Building-B", "Computing-1", "Aisle-1", "C-12", "U22");

export function DevBarcodesClient() {
  return (
    <>
      <div className="mb-10 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-amber-950">
        <p className="font-semibold">Operational QR payloads</p>
        <p className="mt-2">
          Tech workflows scan <strong>QR codes</strong> only. Each tile below encodes the exact string the scanner sends
          (same strings typed + Enter in wedge fallback).
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Receive — camera</strong> — three QRs: asset tag, then{" "}
            <code className="rounded bg-white/80 px-1">EQ:serial|manufacturer|model|asset_type</code>, then{" "}
            <code className="rounded bg-white/80 px-1">{COMPACT_LOCATION_BARCODE_LABEL}</code>.
          </li>
          <li>
            <strong>Receive — manual</strong> — type serial, manufacturer, model, and asset type on separate screens, then site,
            room, and rack as <strong>three separate fields</strong> (no slashes; same three strings as in a compact location QR).
          </li>
          <li>
            Asset tags — payload <code className="rounded bg-white/80 px-1">/^C\d{7}$/</code>
          </li>
          <li>Inside an equipment QR, serial is alphanumeric or SN-* (never the C-tag pattern)</li>
          <li>
            Locations (receive / store) — single QR payload{" "}
            <code className="rounded bg-white/80 px-1">{COMPACT_LOCATION_BARCODE_LABEL}</code> (slashes only; example{" "}
            <code className="rounded bg-white/80 px-1">{COMPACT_LOCATION_BARCODE_EXAMPLE}</code>)
          </li>
          <li>
            <strong>Deploy — camera</strong> — after the asset tag, one QR with{" "}
            <code className="rounded bg-white/80 px-1">{DEPLOY_COMPACT_LOCATION_BARCODE_LABEL}</code> (four slash-separated
            segments, example <code className="rounded bg-white/80 px-1">{DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE}</code>).
          </li>
          <li>
            <strong>Deploy — manual</strong> — type site, room, rack, and RU as <strong>four separate fields</strong> (no
            slashes; same strings as in a deploy location QR).
          </li>
          <li>Custodian badges — ids like tech-jane or manager-paul</li>
        </ul>
      </div>

      <Section
        title="Receive — three-scan set (try this first)"
        description="Use these three tiles in order for dock receive (camera or manual). Step 2 is one QR for serial, manufacturer, model, and asset_type — not a bare serial."
      >
        <QrTile
          label="1 · Asset tag"
          value={RECEIVE_SAMPLE_TAG}
          note="Pair with equipment + dock location below after reset."
          size={160}
        />
        <QrTile label="2 · Equipment bundle" value={RECEIVE_SAMPLE_EQUIPMENT} note="EQ:serial|mfr|model|type (pipes)." size={158} />
        <QrTile
          label="3 · Dock location"
          value={receiveDockLocation}
          note="Submit step — compact SITE/ROOM/RACK."
          size={158}
        />
      </Section>

      <Section
        title="Asset tags"
        description="Receive · Store · Deploy · Transfer — step 1. Fresh tags below sit outside the seeded C0000101–C0000112 block (use after POST /v1/reset for clean receives)."
      >
        <QrTile label="Fresh QA (unused)" value="C0009001" size={152} />
        <QrTile label="Second fresh QA" value="C0009002" size={152} />
        <QrTile
          label="On dock (received @ DOCK-2)"
          value="C0000107"
          note={`Seeded receive location QR: ${LOC.dock2}. Use for duplicate-receive or downstream store/deploy.`}
        />
        <QrTile label="Stored @ Storage-1 / SHELF-3" value="C0000104" note="Good for store-from-stored paths." size={152} />
      </Section>

      <Section
        title="Equipment QR (receive step 2) — more examples"
        description="Must start with EQ: and use exactly four pipe-separated fields. Serial must not look like a C-tag."
      >
        <QrTile
          label="Compute server"
          value={formatReceiveEquipmentQr("SN-COMPUTE-B2", "ServerCo", "Compute Server R760", "compute")}
          size={156}
        />
        <QrTile
          label="Network switch"
          value={formatReceiveEquipmentQr("SN-NET-48P-02", "NetCorp", "Lab Network Switch 48p", "network")}
          size={156}
        />
        <QrTile
          label="Matches C0000107 serial only"
          value={formatReceiveEquipmentQr("SN-INST-A005", "Seeded", "Placeholder", "instrument")}
          note="Use with asset tag C0000107 when testing duplicate receive."
          size={156}
        />
      </Section>

      <Section
        title="Locations"
        description={`Receive step 3 and Store step 2 — one QR payload ${COMPACT_LOCATION_BARCODE_LABEL} (parser rejects |).`}
      >
        <QrTile label="Dock staging — C0000107 default" value={LOC.dock2} />
        <QrTile label="Put-away — C0000104 / C0000105" value={LOC.shelf3} />
        <QrTile label="Bay-12 rack column" value={LOC.bayRack} />
        <QrTile label="Building B — compute row" value={LOC.buildingBCompute} />
        <QrTile label="Building B — storage shelf" value={LOC.storageB} />
        <QrTile label="RMA staging rack" value={LOC.rmaBin} />
        <QrTile label="Disposal pallet" value={LOC.disposal} />
        <QrTile label="Telecom rack" value={LOC.telecom} />
      </Section>

      <Section
        title="Custodians"
        description="Transfer step 2 — payload is the receiver id (same as POST transfer to_custodian)."
      >
        <QrTile label="Default tech" value="tech-jane" size={156} />
        <QrTile label="Alternate tech" value="tech-mike" size={156} />
        <QrTile label="Custodian on C0000107" value="tech-carlos" size={156} />
        <QrTile label="Building B compute" value="tech-priya" size={156} />
        <QrTile label="Manager role" value="manager-paul" size={156} />
      </Section>

      <Section
        title="Deploy — full rack location (camera)"
        description={`Use /tech/deploy with “Use camera for this flow”. One QR encodes ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL} — not the three-part receive/store location QR.`}
      >
        <QrTile label="Bay-12 · B-04 · U16" value={deployBayB04U16} note="Example Bay rack + RU." />
        <QrTile label="Receiving · DOCK-2 · P-02" value={deployDockP02} note="Dock staging with slot label." />
        <QrTile label="Storage-1 · SHELF-3 · U08" value={deployShelfRu} note="Seeded store path companion." />
        <QrTile label="Building B · C-12 · U22" value={deployBuildingBC12} note="Compute row + RU." />
      </Section>

      <Section
        title="Reconciliation & drift (asset tags)"
        description="Step 1 only when testing cross-system scenarios."
      >
        <QrTile label="Golden aligned" value="C0000101" note="Ops + facilities + finance aligned." />
        <QrTile label="Drift — facilities RU differs" value="C0000110" note="Ops RU U18 vs facilities mock U16 at C-12." />
        <QrTile label="Drift — disposed in ops" value="C0000109" note="Stale facilities row." />
        <QrTile label="Ghost — facilities only (fac-9001)" value="C0000199" />
        <QrTile label="Ghost — finance pending_receipt only" value="C0000113" />
        <QrTile label="Blocked state — RMA pending" value="C0000108" />
      </Section>
    </>
  );
}
