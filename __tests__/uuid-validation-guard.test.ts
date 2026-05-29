/**
 * SEC-UUID-01 (#631): Regression tests ensuring quiz submission_id
 * and wrist-shot product_id are validated as UUIDs before DB queries.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const quizRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/quiz/[slug]/submit/route.ts"),
  "utf-8",
);

const wristShotRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/community/wrist-shots/route.ts"),
  "utf-8",
);

describe("SEC-UUID-01 (#631): UUID validation guards", () => {
  describe("quiz submit", () => {
    it("imports isUsableUuid", () => {
      expect(quizRoute).toContain("import { isUsableUuid }");
    });

    it("validates submission_id with isUsableUuid before DB query", () => {
      expect(quizRoute).toMatch(/submission_id.*isUsableUuid/s);
    });

    it("returns 400 for invalid submission_id", () => {
      const validationBlock = quizRoute.slice(
        quizRoute.indexOf("SEC-UUID-01"),
        quizRoute.indexOf("let submission;"),
      );
      expect(validationBlock).toContain("400");
      expect(validationBlock).toContain("Invalid submission_id");
    });
  });

  describe("wrist-shots POST", () => {
    it("validates product_id with isUsableUuid before DB insert", () => {
      expect(wristShotRoute).toMatch(/product_id.*isUsableUuid/s);
    });

    it("returns 400 for invalid product_id in POST", () => {
      // Find the SEC-UUID-01 block in the POST handler
      const validationBlock = wristShotRoute.slice(
        wristShotRoute.indexOf("SEC-UUID-01"),
        wristShotRoute.indexOf("Validate email"),
      );
      expect(validationBlock).toContain("400");
      expect(validationBlock).toContain("Invalid product_id");
    });

    it("GET already validates product_id (pre-existing)", () => {
      // Confirm the GET handler already has UUID validation
      const getHandler = wristShotRoute.slice(
        wristShotRoute.indexOf("export async function GET"),
        wristShotRoute.indexOf("export async function POST"),
      );
      expect(getHandler).toContain("isUsableUuid(productId)");
    });
  });
});
