#!/usr/bin/env bash
set -euo pipefail

source_file_id="${NIIGO_APPS_SCRIPT_SOURCE_FILE_ID:-$(sed -n 's/^NIIGO_APPS_SCRIPT_SOURCE_FILE_ID=//p' .env)}"
if [[ ! "$source_file_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo 'NIIGO_APPS_SCRIPT_SOURCE_FILE_ID must be set to a valid Drive file ID in .env' >&2
  exit 1
fi

deploy_dir=apps-script/deploy
mkdir -p "$deploy_dir"
sed "s/__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__/$source_file_id/g" \
  apps-script/static/Bootstrap.js > "$deploy_dir/Bootstrap.js"
cp apps-script/static/appsscript.json "$deploy_dir/appsscript.json"

clasp push --force
