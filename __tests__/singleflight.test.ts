import { describe, it, expect, vi } from "vitest";
import { Singleflight } from "@/lib/singleflight";

describe("S9-H2: Singleflight request coalescing", () => {
  it("should execute the function and return the result", async () => {
    const flight = new Singleflight<string>();
    const result = await flight.do("key1", async () => "hello");
    expect(result).toBe("hello");
  });

  it("should coalesce concurrent calls with the same key", async () => {
    const flight = new Singleflight<number>();
    const fn = vi
      .fn()
      .mockImplementation(
        () => new Promise<number>((resolve) => setTimeout(() => resolve(42), 50)),
      );

    // Fire 3 concurrent calls with the same key
    const [a, b, c] = await Promise.all([
      flight.do("same-key", fn),
      flight.do("same-key", fn),
      flight.do("same-key", fn),
    ]);

    // All get the same result
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);

    // But fn was only called once
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should NOT coalesce calls with different keys", async () => {
    const flight = new Singleflight<string>();
    const fn = vi
      .fn()
      .mockImplementation(
        (key: string) => new Promise<string>((resolve) => setTimeout(() => resolve(key), 20)),
      );

    const [a, b] = await Promise.all([
      flight.do("key-a", () => fn("a")),
      flight.do("key-b", () => fn("b")),
    ]);

    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should remove the key after the promise resolves (allow fresh calls)", async () => {
    const flight = new Singleflight<number>();
    let callCount = 0;
    const fn = async () => ++callCount;

    const first = await flight.do("k", fn);
    expect(first).toBe(1);
    expect(flight.size).toBe(0);

    // Second call should execute fresh
    const second = await flight.do("k", fn);
    expect(second).toBe(2);
  });

  it("should propagate errors to all waiters and remove the key", async () => {
    const flight = new Singleflight<string>();
    const fn = vi.fn().mockRejectedValue(new Error("db timeout"));

    const results = await Promise.allSettled([
      flight.do("fail-key", fn),
      flight.do("fail-key", fn),
    ]);

    // Both should reject with the same error
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("rejected");
    if (results[0].status === "rejected") {
      expect(results[0].reason.message).toBe("db timeout");
    }

    // fn was only called once despite 2 waiters
    expect(fn).toHaveBeenCalledTimes(1);

    // Key is cleared after rejection
    expect(flight.size).toBe(0);
  });

  it("should track in-flight count via size property", async () => {
    const flight = new Singleflight<string>();
    let resolve1: (v: string) => void;
    const p1 = new Promise<string>((r) => {
      resolve1 = r;
    });

    expect(flight.size).toBe(0);

    const promise = flight.do("inflight", () => p1);
    expect(flight.size).toBe(1);

    resolve1!("done");
    await promise;
    expect(flight.size).toBe(0);
  });
});
