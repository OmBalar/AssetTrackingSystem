/** Shared short copy for wand/camera + keyboard paths. */
export const SCAN_INVALID_TAG =
  "Bad asset-tag QR — payload must be C + 7 digits (e.g. C0009001). Rescan.";
export const SCAN_INVALID_SERIAL =
  "Bad serial QR — use alphanumeric or SN-… format (not an asset tag). Rescan.";
export const SCAN_INVALID_RECEIVE_EQUIPMENT =
  "Bad equipment QR — use EQ:serial|manufacturer|model|asset_type (see dev barcodes). Rescan.";
export const SCAN_INVALID_CUSTODIAN =
  "Badge QR looks wrong — expect ids like tech-jane or manager-paul (letters + hyphen). Rescan.";
export const SCAN_NETWORK_DOWN =
  "Network or server unreachable. Fix connection, then scan again.";
