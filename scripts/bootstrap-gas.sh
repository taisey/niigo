#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Usage: npm run gas:bootstrap -- DRIVE_FILE_ID' >&2
  exit 1
fi
source_file_id="$1"
if [[ ! "$source_file_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo 'DRIVE_FILE_ID must be a valid Drive file ID' >&2
  exit 1
fi

deploy_dir=gas/.clasp-build
mkdir -p "$deploy_dir"
sed "s/__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__/$source_file_id/g" \
  gas/static/Bootstrap.js > "$deploy_dir/Bootstrap.js"
cp gas/static/appsscript.json "$deploy_dir/appsscript.json"

clasp push --force
