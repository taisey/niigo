#!/usr/bin/env bash
set -euo pipefail

source_file_id="${NIIGO_APPS_SCRIPT_SOURCE_FILE_ID:-}"
script_id="${NIIGO_GAS_SCRIPT_ID:-}"
if [[ ! "$source_file_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo 'NIIGO_APPS_SCRIPT_SOURCE_FILE_ID must be a valid Drive file ID' >&2
  exit 1
fi
if [[ ! "$script_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo 'NIIGO_GAS_SCRIPT_ID must be a valid Apps Script project ID' >&2
  exit 1
fi

deploy_dir=gas/.clasp-build
mkdir -p "$deploy_dir"
sed "s/YOUR_SCRIPT_ID/$script_id/g" gas/.clasp.json.example > .clasp.json
sed "s/__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__/$source_file_id/g" \
  gas/static/Bootstrap.js > "$deploy_dir/Bootstrap.js"
cp gas/static/appsscript.json "$deploy_dir/appsscript.json"
rm -f "$deploy_dir/Code.js"

clasp push --force
