#!/usr/bin/env bash
set -euo pipefail

echo "C.S.V. BEACON - Replit workspace cleanup phase 5"
echo "This moves referenced Images/ into public/Images/ because runtime serves ./public."
echo "It does NOT delete files."

if [ ! -d Images ]; then
  echo "No top-level Images/ folder found."
  exit 0
fi

mkdir -p public

if [ -d public/Images ]; then
  echo "public/Images already exists. Moving contents into it..."
  shopt -s nullglob dotglob
  mv Images/* public/Images/
  rmdir Images
else
  echo "Moving Images/ to public/Images/"
  mv Images public/Images
fi

echo ""
echo "Verifying moved image files:"
find public/Images -maxdepth 1 -type f | sort | head -5
echo "..."
find public/Images -maxdepth 1 -type f | wc -l

echo ""
echo "Phase 5 complete."
