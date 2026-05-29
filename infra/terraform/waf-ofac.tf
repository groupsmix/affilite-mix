# S8-F14 / A246-L3: OFAC / sanctions hard-block ruleset.
#
# Previous version blocked 4 countries (IR, KP, SY, CU). Season 8 CEO
# audit (F14) flagged that Crimea, Donetsk, and Luhansk are sanctioned
# regions not covered, and no SDN IP feed is integrated.
#
# Cloudflare WAF geo rules operate at country granularity; sub-national
# regions (Crimea, Donetsk, Luhansk) cannot be targeted by country code
# alone. Applying a full UA block is disproportionate — instead we add
# the country-level blocks we can enforce and document the sub-region
# limitation.
#
# Added:
#   RU — Russia (OFAC comprehensive sanctions since Feb 2022)
#   BY — Belarus (OFAC sectoral sanctions, SDN-heavy)
#   MM — Myanmar (OFAC comprehensive sanctions)
#   VE — Venezuela (OFAC targeted/sectoral sanctions on government)
#   SD — Sudan (OFAC comprehensive sanctions — re-listed 2023)
#
# Sub-region limitation (documented, not enforceable at WAF geo layer):
#   Crimea, Donetsk People's Republic, Luhansk People's Republic —
#   these are OFAC-sanctioned regions within UA. Cloudflare geo IP
#   resolution may tag traffic from these areas as UA or RU depending
#   on the IP block. The RU block above provides partial coverage.
#   Full coverage requires an SDN IP-feed integration (out of scope
#   for WAF rules; tracked in docs/open-investigations.md).

resource "cloudflare_ruleset" "ofac_block" {
  zone_id = var.cloudflare_zone_id
  name    = "ofac-hard-block"
  kind    = "zone"
  phase   = "http_request_firewall_custom"
  rules {
    action      = "block"
    expression  = "(ip.geoip.country in {\"IR\" \"KP\" \"SY\" \"CU\" \"RU\" \"BY\" \"MM\" \"VE\" \"SD\"})"
    description = "S8-F14: OFAC/sanctions comprehensive country block"
    enabled     = true
  }
}
