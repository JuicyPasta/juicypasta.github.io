#!/bin/zsh
# Rebuilds /resume.pdf from _resume/resume.html with headless Chrome (Letter, no header/footer).
# Run from anywhere: zsh ~/code/Projects/juicypasta.github.io/_resume/build.sh
set -e
here=${0:A:h}
profile=$(mktemp -d)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-pdf-header-footer --user-data-dir="$profile" \
  --print-to-pdf="$here/../resume.pdf" "file://$here/resume.html" 2>/dev/null
rm -rf "$profile"
pdfinfo "$here/../resume.pdf" | grep -E '^(Title|Pages|Page size)'
