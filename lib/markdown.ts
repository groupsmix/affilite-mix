/**
 * Minimal, dependency-free Markdown → HTML converter for content bodies.
 *
 * Only handles the constructs the site's AI-generated articles use:
 * headings, paragraphs, lists, bold/italic, links, inline code, and hr.
 * The output is always run through the shared HTML sanitizer before rendering.
 */

const BLOCKQUOTE_RE = /^(>\s?)(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^(?:[-*])\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;
const HR_RE = /^(---|___|\*\*\*)\s*$/;
const CODE_FENCE_RE = /^```(?:\w*)?$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineHtml(text: string): string {
  let s = text;

  // Code spans (double-backtick first, then single backtick)
  s = s.replace(/``([^`]+)``/g, "<code>$1</code>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold, then italic. Order matters so ** doesn't become *italic*.
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_\s][^_]*?)_/g, "<em>$1</em>");

  // Links [text](url)
  s = s.replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Strikethrough
  s = s.replace(/~~([^~]+?)~~/g, "<del>$1</del>");

  return s;
}

function lineIsSpecial(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line) ||
    BLOCKQUOTE_RE.test(line) ||
    HR_RE.test(line) ||
    CODE_FENCE_RE.test(line)
  );
}

function normalizeMarkdown(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  // If the text has almost no line breaks, the AI likely dumped everything on
  // one line. Insert newlines before block markers so the parser can do its job.
  if (lines.length <= 2) {
    text = text
      .replace(/(^|\s)(#{1,6}\s)/g, "$1\n$2")
      .replace(/(^|\s)(---|___|\*\*\*)\s/g, "$1\n$2\n")
      .replace(/(^|\s)(\d+\.\s)/g, "$1\n$2")
      .replace(/(^|\s)([-*]\s)/g, "$1\n$2");
  }
  return text;
}

export function markdownToHtml(markdown: string): string {
  const normalized = normalizeMarkdown(markdown);
  const rawLines = normalized.split("\n");
  const lines = rawLines.map((l) => l.trimEnd());

  const blocks: string[] = [];
  let currentParagraph: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  function flushParagraph() {
    if (currentParagraph.length === 0) return;
    const html = inlineHtml(escapeHtml(currentParagraph.join(" ").trim()));
    blocks.push(html ? `<p>${html}</p>` : "");
    currentParagraph = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    const tag = listType === "ol" ? "ol" : "ul";
    blocks.push(`<${tag}>${listItems.join("")}</${tag}>`);
    listItems = [];
    listType = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Code fences
    const codeFence = CODE_FENCE_RE.exec(line);
    if (codeFence) {
      if (inCodeBlock) {
        blocks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushParagraph();
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    const blank = line.trim() === "";
    const heading = HEADING_RE.exec(line);
    const ul = UL_RE.exec(line);
    const ol = OL_RE.exec(line);
    const hr = HR_RE.exec(line);

    // Headings
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length;
      const tag = `h${level}`;
      blocks.push(`<${tag}>${inlineHtml(escapeHtml(heading[2]!.trim()))}</${tag}>`);
      continue;
    }

    // Horizontal rule
    if (hr) {
      flushParagraph();
      flushList();
      blocks.push("<hr />");
      continue;
    }

    // Lists
    if (ul || ol) {
      flushParagraph();
      const newType = ul ? "ul" : "ol";
      if (listType && listType !== newType) {
        flushList();
      }
      listType = newType;
      const itemText = (ul ?? ol)![1];
      listItems.push(`<li>${inlineHtml(escapeHtml((itemText ?? "").trim()))}</li>`);
      continue;
    }

    // End of list
    if (listType && !ul && !ol && !blank) {
      flushList();
    }

    if (blank) {
      flushParagraph();
      continue;
    }

    // Blockquote
    const bq = BLOCKQUOTE_RE.exec(line);
    if (bq) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${inlineHtml(escapeHtml(bq[2]!.trim()))}</blockquote>`);
      continue;
    }

    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();

  if (inCodeBlock && codeBuffer.length) {
    blocks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }

  return blocks.filter(Boolean).join("\n");
}

/**
 * Heuristic: does this string look like Markdown rather than HTML?
 * We only trigger conversion for bodies that contain unescaped Markdown
 * heading/list/bold markers and no surrounding HTML tags.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  if (/<[a-z][^>]*>/i.test(text.trim())) return false; // already HTML
  const lines = text.split(/\r?\n/);
  const specialLines = lines.filter(
    (l) =>
      /^#{1,6}\s+\S/.test(l) ||
      /^(?:[-*])\s+\S/.test(l) ||
      /^\d+\.\s+\S/.test(l) ||
      /\*\*[^*]+\*\*/.test(l) ||
      /`[^`]+`/.test(l) ||
      /\[([^\]]+)]\(([^)]+)\)/.test(l),
  );
  return (
    specialLines.length >= 2 || (specialLines.length === 1 && /^#{1,6}\s+\S/.test(lines[0] || ""))
  );
}
