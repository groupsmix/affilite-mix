import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { compose, type MiddlewareContext, type MiddlewareFunction } from "@/lib/middleware/compose";

function makeCtx(overrides: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    hostname: "example.com",
    pathname: "/",
    siteId: null,
    verifiedSite: null,
    traceId: "test-trace-123",
    gpcEnabled: false,
    depth: 0,
    ...overrides,
  };
}

function makeRequest(url = "https://example.com/"): NextRequest {
  return new NextRequest(url);
}

describe("H-4: Middleware compose utility", () => {
  it("should run all middlewares in order when none short-circuit", async () => {
    const order: number[] = [];
    const mw1: MiddlewareFunction = () => {
      order.push(1);
      return null;
    };
    const mw2: MiddlewareFunction = () => {
      order.push(2);
      return null;
    };
    const mw3: MiddlewareFunction = () => {
      order.push(3);
      return null;
    };

    const finalizer = async () => {
      order.push(99);
      return NextResponse.next();
    };

    const pipeline = compose([mw1, mw2, mw3], finalizer);
    await pipeline(makeRequest(), makeCtx());

    expect(order).toEqual([1, 2, 3, 99]);
  });

  it("should short-circuit when a middleware returns a response", async () => {
    const order: number[] = [];
    const mw1: MiddlewareFunction = () => {
      order.push(1);
      return null;
    };
    const mw2: MiddlewareFunction = () => {
      order.push(2);
      return new NextResponse("blocked", { status: 403 });
    };
    const mw3: MiddlewareFunction = () => {
      order.push(3);
      return null;
    };

    const finalizer = async () => {
      order.push(99);
      return NextResponse.next();
    };

    const pipeline = compose([mw1, mw2, mw3], finalizer);
    const result = await pipeline(makeRequest(), makeCtx());

    expect(order).toEqual([1, 2]);
    expect(result.status).toBe(403);
  });

  it("should allow middleware to mutate context for downstream use", async () => {
    const mw1: MiddlewareFunction = (_req, ctx) => {
      ctx.siteId = "resolved-site";
      return null;
    };
    const mw2: MiddlewareFunction = (_req, ctx) => {
      expect(ctx.siteId).toBe("resolved-site");
      return null;
    };

    const finalizer = async (_req: NextRequest, ctx: MiddlewareContext) => {
      expect(ctx.siteId).toBe("resolved-site");
      return NextResponse.next();
    };

    const pipeline = compose([mw1, mw2], finalizer);
    await pipeline(makeRequest(), makeCtx());
  });

  it("should handle async middleware functions", async () => {
    const mw1: MiddlewareFunction = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return null;
    };

    const finalizer = async () => NextResponse.next();
    const pipeline = compose([mw1], finalizer);
    const result = await pipeline(makeRequest(), makeCtx());

    expect(result.status).toBe(200);
  });

  it("should call finalizer when middleware array is empty", async () => {
    let finalizerCalled = false;
    const finalizer = async () => {
      finalizerCalled = true;
      return NextResponse.next();
    };

    const pipeline = compose([], finalizer);
    await pipeline(makeRequest(), makeCtx());

    expect(finalizerCalled).toBe(true);
  });
});
