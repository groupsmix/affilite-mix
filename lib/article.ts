import { sanitizeHtmlMemoized } from "./sanitize-html";
import { looksLikeMarkdown, markdownToHtml } from "./markdown";
import { injectProductLinks } from "./internal-links";
import type { ProductRow } from "@/types/database";

export interface TocItem {
  level: number;
  id: string;
  text: string;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyHeading(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .replace(/^-+|-+$/g, "") || "section"
  );
}

export function injectHeadingIds(html: string): string {
  return html.replace(/<h([2-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attrs, content) => {
    if (/\sid=/i.test(attrs)) return match;
    const plain = stripTags(content);
    const id = slugifyHeading(plain);
    return `<h${level} id="${id}"${attrs}>${content}</h${level}>`;
  });
}

export function extractToc(html: string): TocItem[] {
  const toc: TocItem[] = [];
  const regex = /<h([2-6])\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1]!, 10);
    const id = match[2]!;
    const text = stripTags(match[3]!).trim();
    if (text) {
      toc.push({ level, id, text });
    }
  }
  return toc;
}

function normalizeHeadingText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "");
}

function removeLeadingTitleHeading(html: string, title: string): string {
  if (!title) return html;
  const trimmed = html.trim();
  const match = trimmed.match(/^<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i);
  if (!match) return html;
  const headingText = match[2] ?? "";
  const headingPlain = normalizeHeadingText(headingText);
  const titlePlain = normalizeHeadingText(title);
  if (!headingPlain || !titlePlain) return html;
  if (
    headingPlain === titlePlain ||
    headingPlain.includes(titlePlain) ||
    titlePlain.includes(headingPlain)
  ) {
    return trimmed.slice(match[0].length).trimStart();
  }
  return html;
}

export interface PrepareBodyInput {
  body: string;
  isHtml?: boolean;
  linkedProducts?: ProductRow[];
  title?: string;
}

export function prepareArticleBody({
  body,
  isHtml = false,
  linkedProducts,
  title,
}: PrepareBodyInput): {
  html: string;
  toc: TocItem[];
} {
  let html = isHtml
    ? body
    : sanitizeHtmlMemoized(looksLikeMarkdown(body) ? markdownToHtml(body) : body);

  if (!isHtml && linkedProducts?.length) {
    html = injectProductLinks(html, linkedProducts, true);
  }

  html = injectHeadingIds(html);
  html = removeLeadingTitleHeading(html, title ?? "");
  const toc = extractToc(html);
  return { html, toc };
}

export function estimateReadingTime(html: string): number {
  const text = stripTags(html);
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
