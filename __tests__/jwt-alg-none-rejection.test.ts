/**
 * A1-A30 audit recommendation #5:
 * Confirm JWT library rejects alg:none and alg:RS256 tokens
 * when the server expects HS256 (symmetric secret).
 *
 * This prevents algorithm-confusion attacks where an attacker:
 *   - Sets alg:none to bypass signature verification entirely
 *   - Sets alg:RS256 with the public key as HMAC secret
 */
import { jwtVerify, SignJWT } from "jose";

const TEST_SECRET = new TextEncoder().encode("test-secret-at-least-32-bytes-long!");

describe("JWT algorithm confusion rejection", () => {
  it("accepts valid HS256 token (positive control)", async () => {
    const token = await new SignJWT({ sub: "admin@test.com" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(TEST_SECRET);

    const { payload } = await jwtVerify(token, TEST_SECRET, {
      algorithms: ["HS256"],
    });

    expect(payload.sub).toBe("admin@test.com");
  });

  it("rejects tokens with alg:none", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "admin@test.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const forgedToken = `${header}.${payload}.`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toMatchObject({ code: "ERR_JOSE_ALG_NOT_ALLOWED" });
  });

  it("rejects tokens with alg:None (case variant)", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "None", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "admin@test.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const forgedToken = `${header}.${payload}.`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toMatchObject({ code: "ERR_JOSE_ALG_NOT_ALLOWED" });
  });

  it("rejects tokens with alg:RS256 when expecting HS256", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "admin@test.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const fakeSignature = Buffer.from("fake-signature-data").toString("base64url");
    const forgedToken = `${header}.${payload}.${fakeSignature}`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toMatchObject({ code: "ERR_JOSE_ALG_NOT_ALLOWED" });
  });

  it("rejects tokens with alg:HS384 when only HS256 is allowed", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS384", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "admin@test.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const fakeSignature = Buffer.from("fake-signature").toString("base64url");
    const forgedToken = `${header}.${payload}.${fakeSignature}`;

    await expect(
      jwtVerify(forgedToken, TEST_SECRET, { algorithms: ["HS256"] }),
    ).rejects.toMatchObject({ code: "ERR_JOSE_ALG_NOT_ALLOWED" });
  });
});
