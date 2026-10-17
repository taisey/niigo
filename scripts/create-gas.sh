#!/usr/bin/env bash
set -euo pipefail

spreadsheet_id="${NIIGO_SPREADSHEET_ID:-}"
if [[ ! "$spreadsheet_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo 'NIIGO_SPREADSHEET_ID must be a valid spreadsheet ID' >&2
  exit 1
fi
if [[ -f .clasp.json ]]; then
  echo 'An Apps Script project is already configured in .clasp.json' >&2
  exit 1
fi

clasp create-script --title NIIGO --parentId "$spreadsheet_id" --rootDir gas/.clasp-build
echo 'Copy the generated scriptId from .clasp.json to NIIGO_GAS_SCRIPT_ID in .env.'
