# Asset Tracking — Cerebras AI Builder Challenge

**Live demo:** https://asset-tracking-system-starter.vercel.app/

## Running locally

```bash
pnpm install
cp starter/.env.example starter/.env
# Edit starter/.env with values below
pnpm dev   # API on :8080, starter on :3000
```

| Variable | Notes |
|---|---|
| `API_BASE_URL` | Upstream API including `/v1`, e.g. `http://localhost:8080/v1` |
| `API_TOKEN` | Server-only bearer token. Use `local-dev-token-1234567890` for local dev. |

---

## What I built

### Technician workflows (`/tech/*`)
Four mobile-first scan flows built for a tech at 11pm in a cold dock bay, gloves on, scanner in one hand, instrument in the other.

- **`/tech/receive`** — Three-scan flow: asset tag, device QR (serial + manufacturer + model + asset class), dock location. Handles duplicate receives idempotently and shows both serials side-by-side on mismatched serial IDs so the tech can compare without guessing.
- **`/tech/store`** — Scan asset, scan storage location. Shows current state before committing so the tech can catch wrong-state errors. De-racks from facilities when storing from `in_service`.
- **`/tech/deploy`** — Scan asset, scan full rack location (site/room/row/rack/RU). Writes to facilities and finance server-side on success.
- **`/tech/transfer`** — Scan asset, scan receiving badge. Logged-in user is automatically the from-custodian. State unchanged, custodian updated.

### Manager views (`/manager/*`)
- **`/manager`** — Asset list with state/site/custodian filtering, pagination at ~1,000 rows, per-state summary counts, and inline reconciliation alerts on flagged rows.
- **`/manager/assets/[tag]`** — Asset detail with current state, reconciliation alert (if flagged), and full event log newest-first.
- **`/manager/reconcile`** — Three-way reconciliation report: categorized, not a raw diff. Managers see what needs action first.

### Reconciliation (`app/api/reconcile/route.ts`)
Server-side join across operations, facilities, and finance. Returns a structured report and the page just renders JSON. The join logic lives in `lib/reconciliation.ts` and is independently testable without a running server.

### Barcode tooling (`/dev/barcodes`)
Scannable QR codes covering: asset tags, device labels (serial + manufacturer + model + asset class), dock locations, full rack locations, and badge IDs. Includes edge cases: a drifted asset, a disposed asset, and a ghost/orphan record.

---

## Three calls I nearly made the other way

**1. A "fix" button on reconciliation drift rows**
I considered adding a one-click repair action on drift rows, for example a button that pushes the ops location to facilities when they disagree. Decided against it because the reconciliation report is a diagnostic tool, not an action surface. A button that silently updates facilities based on ops data assumes ops is always the authority, which is not true. Sometimes facilities caught a move that ops missed. The right action is a floor walk and a scan, not a programmatic override. Managers get suggested actions in plain English instead.

**2. Three barcodes on receive instead of one**
I considered bundling everything into a single QR for receive. Split them into asset tag / device QR / location because the mismatched serial case requires the asset tag to be independently scannable. A tech scanning the wrong box needs to see exactly which serial conflicts, and that is only possible if the tag and device QR are separate scans. The three-barcode scheme also mirrors real lab practice: the lab's own tag is applied on arrival, the manufacturer's label is already on the box, and the location barcode lives on the shelf.

**3. Success alert at the top vs. bottom of the scan page**
I initially placed the success banner at the top of the page after a completed workflow. Moved it to the bottom for two reasons: it does not shift the form layout when it appears, and on mobile it sits in thumb reach. A tech holding a scanner in one hand should not have to reach across the screen to see more information for an alert. The input stays in the same position regardless of whether a banner is showing.

---

## What I chose not to build

**"My assets" view for techs.** There is no way for tech-jane to see all assets currently in her custody in one place. The manager list can filter by custodian, but techs do not have that view. Given the hot-path focus I prioritized scan workflows over inventory views.

**A manual user ID field on tech scan pages.** The logged-in user is read automatically from the role switcher cookie and passed as `user_id` on every scan. Asking techs to type their ID on each scan would be slower, error-prone, and redundant. The cookie handles it.

---

## Pushback on the brief and starter

**Location requirements for receive are not documented.** The API specifies that deploy requires `site + row + room + rack + ru`, but receive location requirements are only documented as a generic `422 invalid_location`. I collect site, room, and rack for receive (no `row` or `ru` to keep it consistent with the seeded data). The brief could be clearer here.

**Store and deploy update custodian to the scanning user.** This is intentional per the API source (`custodian: input.user_id` in both route handlers) but undocumented in the API reference. The reference describes deploy as changing only `state` and `location`. Worth documenting explicitly since it affects how managers interpret the custodian field after routine scan operations.

---