/**
 * Click-to-link matching for the EPC recompute cron.
 *
 * Clicks are stored with the URL the visitor was actually sent to — UTM
 * parameters from `affiliateUrlWithUtm()`, plus the network tracking parameter
 * appended by /r/[shortcode]. The configured link URL carries none of those, so
 * the previous exact-equality match found nothing and every product's EPC was
 * computed over zero clicks.
 */

import { describe, it, expect } from "vitest";
import {
  affiliateUrlPrefix,
  clickMatchesPrefix,
  countGroupClicks,
  groupClickFilter,
  groupClickPrefixes,
} from "../app/api/cron/epc-recompute/aggregation";

const LINK = "https://www.amazon.com/dp/B01ABCDEFG";

describe("affiliateUrlPrefix", () => {
  it("drops the query string and the fragment", () => {
    expect(affiliateUrlPrefix(`${LINK}?tag=site-20&utm_source=review#reviews`)).toBe(LINK);
  });

  it("ignores a trailing slash so both spellings collapse together", () => {
    expect(affiliateUrlPrefix(`${LINK}/`)).toBe(affiliateUrlPrefix(LINK));
  });

  it("falls back to the raw value when the URL cannot be parsed", () => {
    expect(affiliateUrlPrefix("not-a-url?x=1")).toBe("not-a-url");
  });
});

describe("clickMatchesPrefix", () => {
  it("matches a click carrying tracking parameters", () => {
    expect(clickMatchesPrefix(`${LINK}?tag=site-20&utm_medium=affiliate`, LINK)).toBe(true);
  });

  it("matches a deeper path under the link", () => {
    expect(clickMatchesPrefix(`${LINK}/ref=nosim`, LINK)).toBe(true);
  });

  it("does not match a different product sharing the prefix as a substring", () => {
    expect(clickMatchesPrefix("https://www.amazon.com/dp/B01ABCDEFGXYZ", LINK)).toBe(false);
  });

  it("does not match a different host", () => {
    expect(clickMatchesPrefix("https://evil.example.com/dp/B01ABCDEFG", LINK)).toBe(false);
  });
});

describe("countGroupClicks", () => {
  it("counts clicks whose destination carries the tracking parameters", () => {
    const clicks = [
      { affiliate_url: `${LINK}?tag=site-20&utm_source=review` },
      { affiliate_url: `${LINK}?tag=site-20&utm_source=sticky` },
      { affiliate_url: "https://www.amazon.com/dp/OTHER?tag=site-20" },
    ];
    expect(countGroupClicks(clicks, [LINK])).toBe(2);
  });

  it("counts a click once even when the group lists the URL twice", () => {
    const clicks = [{ affiliate_url: `${LINK}?utm_source=review` }];
    expect(countGroupClicks(clicks, [LINK, `${LINK}/`, LINK])).toBe(1);
  });

  it("spans every URL of a multi-link group", () => {
    const other = "https://www.walmart.com/ip/12345";
    const clicks = [
      { affiliate_url: `${LINK}?utm_source=review` },
      { affiliate_url: `${other}?utm_source=review` },
    ];
    expect(countGroupClicks(clicks, [LINK, other])).toBe(2);
  });
});

describe("groupClickFilter", () => {
  it("emits one prefix pattern per distinct destination", () => {
    expect(groupClickFilter([LINK, `${LINK}?tag=site-20`])).toBe(`affiliate_url.like."${LINK}*"`);
    expect(groupClickPrefixes([LINK, `${LINK}?tag=site-20`])).toEqual([LINK]);
  });

  it("quotes values so commas and parentheses stay literal", () => {
    const filter = groupClickFilter(["https://shop.example.com/p/a,b(c)"]);
    expect(filter).toBe('affiliate_url.like."https://shop.example.com/p/a,b(c)*"');
  });

  it("joins the patterns of a multi-link group", () => {
    const filter = groupClickFilter([LINK, "https://www.walmart.com/ip/12345"]);
    expect(filter.split(",").length).toBe(2);
  });
});
