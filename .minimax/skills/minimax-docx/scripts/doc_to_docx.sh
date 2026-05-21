#!/usr/bin/env bash
set -euo pipefail

# --- Friendly Windows bailout ------------------------------------------------
case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*)
    _sh_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || dirname "$0")"
    cat >&2 <<EOF
[FAIL] doc_to_docx.sh detected Windows host (git-bash / MSYS / Cygwin).
       LibreOffice headless conversion on Windows is handled by the PowerShell mirror,
       which knows how to find soffice.exe and isolate per-invocation user profiles.

Use the PowerShell mirror instead:
  powershell -ExecutionPolicy Bypass -File "${_sh_dir}\\doc_to_docx.ps1" <file.doc> [output_directory]
EOF
    exit 2
    ;;
esac

usage() {
  echo "Usage: $(basename "$0") <file.doc> [output_directory]"
  echo "Convert .doc to .docx using LibreOffice."
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

INPUT="$1"
OUTDIR="${2:-.}"

if [ ! -f "$INPUT" ]; then
  echo "Error: File not found: $INPUT"
  exit 1
fi

if ! command -v soffice &>/dev/null; then
  echo "Error: soffice (LibreOffice) is required for .doc conversion but not found."
  echo "Install LibreOffice: brew install --cask libreoffice"
  exit 1
fi

BASENAME=$(basename "$INPUT" .doc)
mkdir -p "$OUTDIR"

echo "Converting: $INPUT -> $OUTDIR/$BASENAME.docx"
soffice --headless --convert-to docx --outdir "$OUTDIR" "$INPUT" >/dev/null 2>&1

OUTPUT="$OUTDIR/$BASENAME.docx"
if [ ! -f "$OUTPUT" ]; then
  echo "Error: Conversion failed. Output file not created: $OUTPUT"
  exit 1
fi

echo "Success: $OUTPUT"
