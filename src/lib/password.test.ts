import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  checkPasswordStrength,
  normaliseEmail,
  MIN_PASSWORD_LENGTH,
} from "./password.ts";

test("a correct password verifies and a wrong one does not", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.ok(await verifyPassword("correct horse battery staple", stored));
  assert.ok(!(await verifyPassword("correct horse battery stapl", stored)));
  assert.ok(!(await verifyPassword("", stored)));
});

test("the same password hashes differently every time", async () => {
  // A fresh salt per password. Without it, two people choosing the same password produce the
  // same hash, and cracking one cracks both.
  const a = await hashPassword("same passphrase here");
  const b = await hashPassword("same passphrase here");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("same passphrase here", a));
  assert.ok(await verifyPassword("same passphrase here", b));
});

test("the stored value is salt:hash and reveals no plaintext", async () => {
  const stored = await hashPassword("my secret passphrase");
  const [salt, hash] = stored.split(":");
  assert.match(salt, /^[0-9a-f]{32}$/);
  assert.match(hash, /^[0-9a-f]{128}$/);
  assert.ok(!stored.includes("secret"));
});

test("a malformed stored hash fails the login instead of throwing", async () => {
  // A corrupt row must deny access, not crash the route and surface a stack trace.
  for (const bad of ["", ":", "nosalt", "zz:zz", "abc:", ":abc", "deadbeef:short"]) {
    assert.equal(await verifyPassword("anything", bad), false, `stored=${JSON.stringify(bad)}`);
  }
});

test("verify tolerates non-string input", async () => {
  // Route handlers receive whatever JSON the client sent.
  // @ts-expect-error deliberately wrong type
  assert.equal(await verifyPassword(undefined, "a:b"), false);
  // @ts-expect-error deliberately wrong type
  assert.equal(await verifyPassword("pw", null), false);
});

test("an absurdly long password is refused, not hashed", async () => {
  // scrypt is memory-hard on purpose; hashing unbounded input is a way to burn the server.
  await assert.rejects(() => hashPassword("x".repeat(100_000)));
  assert.equal(await verifyPassword("x".repeat(100_000), "aa:bb"), false);
});

test("session tokens are 32 bytes of hex and never repeat", () => {
  const tokens = new Set(Array.from({ length: 500 }, () => generateSessionToken()));
  assert.equal(tokens.size, 500, "collision in 500 tokens");
  for (const t of tokens) assert.match(t, /^[0-9a-f]{64}$/);
});

test("session tokens do not come from Math.random", () => {
  // `generateId()` in db.ts builds 16 hex chars from Math.random(). Fine for a row id, forgeable
  // as a session token — and a forged token is a full login. Length alone catches a regression
  // to that function.
  const t = generateSessionToken();
  assert.equal(t.length, 64);
  assert.notEqual(t.length, 16);
});

test("password strength is length-based, not composition-based", () => {
  assert.equal(checkPasswordStrength("short").ok, false);
  assert.equal(checkPasswordStrength("a".repeat(MIN_PASSWORD_LENGTH)).ok, false, "all one char");

  // A long passphrase with no digits or symbols is fine. Composition rules produce "Passw0rd!" —
  // compliant and weak — so length is the rule that actually helps.
  assert.equal(checkPasswordStrength("correct horse battery staple").ok, true);
  assert.equal(checkPasswordStrength("x".repeat(300)).ok, false, "too long");
});

test("email normalisation keeps one account per person", () => {
  // Two rows differing only by case would mean one of them silently cannot log in.
  assert.equal(normaliseEmail("  El@StorageMaterials.com "), "el@storagematerials.com");
  assert.equal(normaliseEmail("EL@X.COM"), normaliseEmail("el@x.com"));
  assert.equal(normaliseEmail(undefined as unknown as string), "");
});
