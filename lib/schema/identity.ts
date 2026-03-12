import { createHash } from "node:crypto";

const UUID_V4_OR_V5_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const uuidToBytes = (uuid: string): Uint8Array => hexToBytes(uuid.replace(/-/g, ""));

const bytesToUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

// Static namespace UUID reserved for DipDays canonical venue identity derivation.
const DIPDAYS_VENUE_NAMESPACE = "2dd03fc5-5000-4db9-87f6-ec6bc49b95f3";
const DIPDAYS_EVIDENCE_NAMESPACE = "dc0d6a3e-f507-4d1b-8ba1-8705f82ff4f0";

export const isUuid = (value: string): boolean => UUID_V4_OR_V5_REGEX.test(value);

export const createDeterministicUuid = (name: string, namespaceUuid: string): string => {
  const namespaceBytes = uuidToBytes(namespaceUuid);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1").update(namespaceBytes).update(nameBytes).digest();
  const uuidBytes = new Uint8Array(hash.subarray(0, 16));

  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50; // version 5
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80; // variant RFC 4122

  return bytesToUuid(uuidBytes);
};

export const createStableVenueId = (slug: string): string => createDeterministicUuid(slug, DIPDAYS_VENUE_NAMESPACE);

export const createStableEvidenceId = (fingerprint: string): string => createDeterministicUuid(fingerprint, DIPDAYS_EVIDENCE_NAMESPACE);
