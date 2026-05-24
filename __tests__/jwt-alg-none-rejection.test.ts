/**
 * A1-A30 audit recommendation #5:
 * Confirm JWT library rejects alg:none and alg:RS256 tokens
 * when the server expects HS256 (symmetric secret).
 *
 * This prevents algorithm-confusion attacks where an attacker:
 *   - Sets alg:none to bypass signature verification entirely
 *   - Sets alg:RS256 with the public key as HMAC secret
 */
import { jwtVerify } from "jose";

const TEST_SECRET = new TextEncoder().encode("test-secret-at-least-32-bytes-long!");

describe("JWT algorithm confusion rejection", () => {
  it("rejects tokens with alg:none", async () => {
    // Manually craft a token with alg:none (no signature)
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "admin@test.com", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    const forgedToken = `${header}.${payload}.`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toThrow();
  });

  it("rejects tokens with alg:none (unsigned variant)", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "None", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "admin@test.com", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    const forgedToken = `${header}.${payload}.`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toThrow();
  });

  it("rejects tokens with alg:RS256 when expecting HS256", async () => {
    // Forge a token claiming RS256 but signed with symmetric key material
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "admin@test.com", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    // Fake signature (would be HMAC of the secret if the library incorrectly allowed RS256 with symmetric keys)
    const fakeSignature = Buffer.from("fake-signature-data").toString("base64url");
    const forgedToken = `${header}.${payload}.${fakeSignature}`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toThrow();
  });

  it("rejects tokens with alg:HS384 when only HS256 is allowed", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS384", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "admin@test.com", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    const fakeSignature = Buffer.from("fake-signature").toString("base64url");
    const forgedToken = `${header}.${payload}.${fakeSignature}`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toThrow();
  });
});
