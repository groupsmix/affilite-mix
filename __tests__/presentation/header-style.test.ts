/**
 * headerCssVars must emit the full set of scoped header variables, prefer
 * explicit tokens, and fall back to appearance-appropriate values otherwise.
 */
import { describe, it, expect } from "vitest";
import { headerCssVars } from "@/lib/presentation/header-style";
import { DEFAULT_HEADER_TOKENS } from "@/config/presentation";

type Vars = Record<string, string>;

describe("headerCssVars", () => {
  it("emits all scoped header variables", () => {
    const vars = headerCssVars(DEFAULT_HEADER_TOKENS) as Vars;
    for (const key of [
      "--header-bg",
      "--header-fg",
      "--header-fg-muted",
      "--header-accent",
      "--header-border",
      "--header-hover",
      "--header-font",
    ]) {
      expect(vars[key]).toBeTruthy();
    }
  });

  it("prefers explicit tokens over defaults", () => {
    const vars = headerCssVars({
      ...DEFAULT_HEADER_TOKENS,
      background: "#123456",
      accent: "#654321",
      height: "80px",
    }) as Vars;
    expect(vars["--header-bg"]).toBe("#123456");
    expect(vars["--header-accent"]).toBe("#654321");
    expect(vars["--header-height"]).toBe("80px");
  });

  it("omits --header-height when no height token is set", () => {
    const vars = headerCssVars({ ...DEFAULT_HEADER_TOKENS, height: null }) as Vars;
    expect("--header-height" in vars).toBe(false);
  });

  it("differs between light and dark appearance", () => {
    const dark = headerCssVars({ ...DEFAULT_HEADER_TOKENS, appearance: "dark" }) as Vars;
    const light = headerCssVars({ ...DEFAULT_HEADER_TOKENS, appearance: "light" }) as Vars;
    expect(dark["--header-fg"]).not.toBe(light["--header-fg"]);
  });
});
