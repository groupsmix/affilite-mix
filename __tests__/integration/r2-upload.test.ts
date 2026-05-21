import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchStagingBytes, headStagingObject, promoteToPublicBucket, deleteStagingObject } from "@/lib/r2";
import http from "http";

describe("R2 upload path integration & SSRF guard", () => {
  let server: http.Server;
  let serverUrl: string;

  beforeEach(async () => {
    // Set up a real-ish HTTP server to mock R2 responses
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.method === "GET") {
          // Mock fetchStagingBytes response (e.g. valid JPEG)
          const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
          const padded = Buffer.concat([jpegHeader, Buffer.alloc(20)]);
          res.writeHead(206, { "Content-Length": "32" });
          res.end(padded);
        } else if (req.method === "HEAD") {
          res.writeHead(200, { "Content-Length": "1024" });
          res.end();
        } else if (req.method === "PUT" || req.method === "DELETE") {
          res.writeHead(200);
          res.end();
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    vi.stubEnv("R2_ACCOUNT_ID", "test-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("R2_PRIVATE_BUCKET", "private");
    vi.stubEnv("R2_PUBLIC_BUCKET", "public");
    vi.stubEnv("R2_PUBLIC_URL", "https://r2.example.com");

    // Intercept fetch to route R2 calls to our local server
    const originalFetch = global.fetch;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes(".r2.cloudflarestorage.com")) {
        const modifiedUrl = url.replace(/https:\/\/[^/]+/, serverUrl);
        return originalFetch(modifiedUrl, init);
      }
      return originalFetch(input, init);
    });
  });

  afterEach(() => {
    server.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fetchStagingBytes correctly handles a real HTTP response", async () => {
    const bytes = await fetchStagingBytes("uploads/test.jpg", 32);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });

  it("headStagingObject correctly parses Content-Length", async () => {
    const size = await headStagingObject("uploads/test.jpg");
    expect(size).toBe(1024);
  });

  it("promoteToPublicBucket completes successfully", async () => {
    const result = await promoteToPublicBucket("uploads/test.jpg", "image/jpeg");
    expect(result.publicKey).toBe("uploads/test.jpg");
    expect(result.publicUrl).toBe("https://r2.example.com/uploads/test.jpg");
  });

  it("deleteStagingObject completes successfully", async () => {
    await expect(deleteStagingObject("uploads/test.jpg")).resolves.not.toThrow();
  });
});
