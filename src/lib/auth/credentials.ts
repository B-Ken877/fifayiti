// AUTO-GENERATED — server-only. Do not import this from client components.
//
// scrypt(N=16384, r=8, p=1, dklen=32) password hashes for the FIFAYITI
// staff accounts. Each account has a unique 16-byte random salt.
// Plaintext passwords are NOT stored here (or anywhere in the repo)
// — only the salt + derived key.
//
// To rotate a password: regenerate with scripts/gen-credentials.py
// and replace this file.

export type FifayitiRole =
  | "president"
  | "director"
  | "live_operator"
  | "cameraman"
  | "cameraman1"
  | "cameraman2"
  | "cameraman3"
  | "team_admin";

export interface CredentialRecord {
  role: FifayitiRole;
  email: string;
  saltHex: string;   // 32 hex chars = 16 bytes
  hashHex: string;   // 64 hex chars = 32 bytes
}

export const CREDENTIALS: CredentialRecord[] = [
  {
    role: "president",
    email: "president@fifayiti.com",
    saltHex: "6da98cff04ae3488dbce834f32af0957",
    hashHex: "71be12dd105ced5ef3667b9e01772d4bfc4a45f2f5ff05c24f1c7d229e3f1f42",
  },
  {
    role: "director",
    email: "director@fifayiti.com",
    saltHex: "43d2eb639ae1b87f90149207a5853809",
    hashHex: "2ac6df634913018f609dc0de41c1020a6e958887bc2d755d1f4908479f9b2fcc",
  },
  {
    role: "live_operator",
    email: "live_operator@fifayiti.com",
    saltHex: "c47b0af1ce3fd559b6dbc256b59a8275",
    hashHex: "02e025757c089de8d791e59989cfce424553dc2bb87d73e9b6c3d6df47b37282",
  },
  {
    role: "cameraman",
    email: "cameraman@fifayiti.com",
    saltHex: "a357511ea56c4127ea0475b87260bd56",
    hashHex: "73d90a1cb3d4051c965d2240283534b425f4e653489a0884656db5955da0c88d",
  },
  {
    role: "team_admin",
    email: "team_admin@fifayiti.com",
    saltHex: "a0ce2b9b02b35eb616ee515ec1204712",
    hashHex: "5896bc47e128415c234805385c10995735ccf0fb6b060b2dd13217afa1593220",
  },
  {
    role: "cameraman1",
    email: "cameraman1@fifayiti.com",
    saltHex: "49e5e1fc68a3d315557bbf4179acd7c4",
    hashHex: "a404b861cdc7aee7004de18a6ff6d74c5fc31d5a14f4f9e9eb6579243f03bec4",
  },
  {
    role: "cameraman2",
    email: "cameraman2@fifayiti.com",
    saltHex: "79d69df2b2ee335852353250156b631f",
    hashHex: "949dcf0ba725bc351006510da53f8212d7f159e24591a2b3f55272667c5510d8",
  },
  {
    role: "cameraman3",
    email: "cameraman3@fifayiti.com",
    saltHex: "7a5fc5bd4df139044bc4dcdc9866d994",
    hashHex: "37f1e9444814458ff0c1b8f024ac6acb4dd89c75f6148c3f7aed78d37d97ad89",
  },
];

/**
 * Verify email + password against the credential table.
 * Returns the role on match, or null on failure.
 *
 * Uses Node's crypto.scrypt (server-only, never client). Timing-safe
 * comparison via crypto.timingSafeEqual to mitigate timing attacks.
 */
import { scryptSync, timingSafeEqual } from "crypto";

export function verifyCredentials(email: string, password: string): FifayitiRole | null {
  if (!email || !password) return null;
  const rec = CREDENTIALS.find(
    (c) => c.email.toLowerCase() === email.toLowerCase().trim(),
  );
  if (!rec) return null;
  const salt = Buffer.from(rec.saltHex, "hex");
  const expected = Buffer.from(rec.hashHex, "hex");
  const derived = scryptSync(password, salt, 32, {
    N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024,
  });
  if (derived.length !== expected.length) return null;
  return timingSafeEqual(derived, expected) ? rec.role : null;
}
