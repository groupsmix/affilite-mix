/**
 * Encode a value as JSON safe for embedding inside an HTML `<script>` block.
 *
 * `JSON.stringify` on its own is unsafe for inline `<script>` because:
 *   - `</script>` inside a string terminates the script element early.
 *   - `<!--` / `-->` can open HTML comment states in some parsers.
 *   - U+2028 / U+2029 are valid in JSON strings but break JavaScript
 *     string literals (they are line terminators in ES5+).
 *
 * Replacing those characters with their `\uXXXX` escapes keeps the JSON
 * payload byte-for-byte equivalent at parse time while making it
 * impossible to break out of the surrounding `<script>` element.
 *
 * See: OWASP JSON.stringify guidance; Node.js `util.escapeJsonForHtml`
 * (same approach).
 */
export function safeJsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (ch) =>
      ({
        "<": "\\u003c",
        ">": "\\u003e",
        "&": "\\u0026",
        "\u2028": "\\u2028",
        "\u2029": "\\u2029",
      })[ch] ?? ch,
  );
}
