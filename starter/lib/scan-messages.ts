/** Shared short copy for wand/camera + keyboard paths. */
export const SCAN_INVALID_TAG =
  "Bad asset-tag — payload must be C + 7 digits (e.g. C0009001). Re-enter.";
export const SCAN_INVALID_SERIAL =
  "Bad serial — use alphanumeric or SN-… format (not an asset tag). Re-enter.";
export const SCAN_INVALID_RECEIVE_EQUIPMENT =
  "Bad equipment — use EQ:serial|manufacturer|model|asset_type (see dev barcodes). Re-enter.";
export const SCAN_INVALID_CUSTODIAN =
  "Badge format looks wrong — expect ids like tech-jane or manager-paul (letters + hyphen). Re-enter.";
export const SCAN_NETWORK_DOWN =
  "Network or server unreachable. Fix connection, then scan again.";
