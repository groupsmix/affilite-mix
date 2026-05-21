#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

const root = process.cwd();
const outPath = process.env.ASM_OUTPUT ?? "asm-snapshot.json";
const timeoutMs = Number(process.env.ASM_TIMEOUT_MS ?? 3000);
const forbiddenPorts = (process.env.ASM_FORBIDDEN_PORTS ?? "22,8080,9000")
  .split(",")
  .map((port) => Number(port.trim()))
  .filter((port) => Number.isInteger(port) && port > 0);
const probePorts = [...new Set([80, 443, ...forbiddenPorts])].sort((a, b) => a - b);
const cfApiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "";
const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
const cfZoneId = process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID || "";

function stripJsonc(input) {
  return input
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+\/\/[^\n\r"]*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function extractConfiguredDomains() {
  const domains = new Set();
  const siteDir = path.join(root, "config", "sites");
  for (const entry of fs.readdirSync(siteDir)) {
    if (!entry.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(siteDir, entry), "utf8");
    for (const match of source.matchAll(/\bdomain:\s*["']([^"']+)["']/g)) {
      domains.add(match[1]);
    }
    for (const match of source.matchAll(/aliases:\s*\[([^\]]*)\]/g)) {
      for (const alias of match[1].matchAll(/["']([^"']+)["']/g)) {
        if (!alias[1].endsWith(".localhost")) domains.add(alias[1]);
      }
    }
  }

  try {
    const wrangler = JSON.parse(stripJsonc(readText("wrangler.jsonc")));
    for (const route of wrangler.routes ?? []) {
      const pattern = typeof route === "string" ? route : route.pattern;
      if (!pattern) continue;
      const domain = pattern.replace(/^\*\./, "").replace(/\/.*$/, "");
      if (domain && !domain.includes("${")) domains.add(domain);
    }
  } catch (error) {
    console.warn(`::warning::Unable to parse wrangler.jsonc routes: ${error.message}`);
  }

  return [...domains]
    .map((domain) => domain.toLowerCase())
    .filter((domain) => domain && !domain.includes("localhost"))
    .sort();
}

async function withTimeout(promise, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDomain(domain) {
  const result = { a: [], aaaa: [], cname: [] };
  result.a = await withTimeout(dns.resolve4(domain), []);
  result.aaaa = await withTimeout(dns.resolve6(domain), []);
  result.cname = await withTimeout(dns.resolveCname(domain), []);
  return result;
}

function isBlockedOrRedirected(probe) {
  if (!probe?.http?.reachable) return true;
  if (probe.http.status === 403) return true;
  if ([301, 302, 307, 308].includes(probe.http.status)) {
    return (
      typeof probe.http.location === "string" &&
      probe.http.location.startsWith(`https://${probe.domain}/`)
    );
  }
  return false;
}

function checkHttpPort(domain, port) {
  return new Promise((resolve) => {
    const protocol = port === 443 ? "https" : "http";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetch(`${protocol}://${domain}:${port}/api/health`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "affilite-mix-asm/1.0" },
    })
      .then((response) => {
        clearTimeout(timer);
        resolve({
          reachable: true,
          status: response.status,
          location: response.headers.get("location"),
        });
      })
      .catch(() => {
        clearTimeout(timer);
        resolve({ reachable: false, status: null });
      });
  });
}

function checkPort(domain, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: domain, port, timeout: timeoutMs });
    let settled = false;
    const done = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

function getCertificate(domain) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: domain, servername: domain, port: 443, timeout: timeoutMs });
    let settled = false;
    const done = (certificate) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(certificate);
    };
    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      done({
        subject: cert.subject,
        issuer: cert.issuer,
        valid_from: cert.valid_from,
        valid_to: cert.valid_to,
      });
    });
    socket.on("timeout", () => done(null));
    socket.on("error", () => done(null));
  });
}

async function snapshotDomain(domain) {
  const dnsResult = await resolveDomain(domain);
  const ports = {};
  for (const port of probePorts) {
    const tcpOpen = await checkPort(domain, port);
    const http = await checkHttpPort(domain, port);
    ports[port] = { tcp_open: tcpOpen, http };
  }
  return {
    domain,
    dns: dnsResult,
    ports,
    tls: await getCertificate(domain),
  };
}

async function cloudflareApi(pathname) {
  if (!cfApiToken) return null;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
      headers: { Authorization: `Bearer ${cfApiToken}` },
      signal: AbortSignal.timeout(timeoutMs * 2),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: await response.text() };
    }
    return await response.json();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function collectCloudflareInventory() {
  const inventory = {
    enabled: Boolean(cfApiToken),
    workers_services: null,
    r2_buckets: null,
    dns_records: null,
  };

  if (!cfApiToken) return inventory;

  if (cfAccountId) {
    const services = await cloudflareApi(`/accounts/${cfAccountId}/workers/services`);
    inventory.workers_services = Array.isArray(services?.result)
      ? services.result.map((service) => ({
          id: service.id,
          default_environment: service.default_environment,
        }))
      : services;

    const buckets = await cloudflareApi(`/accounts/${cfAccountId}/r2/buckets`);
    inventory.r2_buckets = Array.isArray(buckets?.result?.buckets)
      ? buckets.result.buckets.map((bucket) => ({
          name: bucket.name,
          creation_date: bucket.creation_date,
        }))
      : buckets;
  }

  if (cfZoneId) {
    const records = await cloudflareApi(`/zones/${cfZoneId}/dns_records?per_page=500`);
    inventory.dns_records = Array.isArray(records?.result)
      ? records.result.map((record) => ({
          name: record.name,
          type: record.type,
          proxied: record.proxied,
        }))
      : records;
  }

  return inventory;
}

const domains = extractConfiguredDomains();
const snapshot = {
  generated_at: new Date().toISOString(),
  policy: {
    forbidden_ports: forbiddenPorts,
    note: "TCP reachability is recorded for visibility. Forbidden-port findings require an HTTP response that is not blocked with 403, avoiding false positives from Cloudflare's anycast edge accepting alternate ports.",
  },
  domains: [],
  cloudflare_inventory: await collectCloudflareInventory(),
  findings: [],
};

if (domains.length === 0) {
  snapshot.findings.push({
    severity: "high",
    type: "no_domains",
    message: "No configured public domains found.",
  });
}

for (const domain of domains) {
  console.log(`ASM probing ${domain}`);
  const result = await snapshotDomain(domain);
  snapshot.domains.push(result);
  for (const port of forbiddenPorts) {
    const probe = result.ports[String(port)];
    if (!isBlockedOrRedirected({ domain, http: probe?.http })) {
      snapshot.findings.push({
        severity: "high",
        type: "forbidden_port_http_allowed",
        domain,
        port,
        status: probe.http.status,
        message: `${domain}:${port} returned HTTP ${probe.http.status}; expected a 403 block or no response`,
      });
    }
  }
}

fs.writeFileSync(path.join(root, outPath), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`ASM snapshot written to ${outPath}`);

const highFindings = snapshot.findings.filter((finding) => finding.severity === "high");
if (highFindings.length > 0) {
  console.error("::error::ASM high-severity findings detected");
  console.error(JSON.stringify(highFindings, null, 2));
  process.exit(1);
}
