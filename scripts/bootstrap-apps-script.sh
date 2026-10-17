#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

source_file_id="${NIIGO_APPS_SCRIPT_SOURCE_FILE_ID:-}"
if [[ -z "$source_file_id" && -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      NIIGO_APPS_SCRIPT_SOURCE_FILE_ID=*)
        source_file_id="${line#*=}"
        break
        ;;
    esac
  done < .env
fi
if [[ "$source_file_id" == \"*\" || "$source_file_id" == \'*\' ]]; then
  source_file_id="${source_file_id:1:${#source_file_id}-2}"
fi
if [[ ! "$source_file_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo 'NIIGO_APPS_SCRIPT_SOURCE_FILE_ID must be set to a valid Drive file ID in .env' >&2
  exit 1
fi

clasp="$repo_dir/node_modules/.bin/clasp"
if [[ ! -x "$clasp" ]]; then
  echo 'Local clasp is missing. Run npm install first.' >&2
  exit 1
fi
if [[ ! -f .clasp.json ]]; then
  echo '.clasp.json is missing. Set the Apps Script project ID before pushing.' >&2
  exit 1
fi

deploy_dir="$repo_dir/apps-script/deploy"
mkdir -p "$deploy_dir"
generated="$(mktemp "$deploy_dir/.Bootstrap.js.XXXXXX")"
trap 'rm -f "$generated"' EXIT
sed "s/__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__/$source_file_id/g" \
  apps-script/static/Bootstrap.js > "$generated"
mv "$generated" "$deploy_dir/Bootstrap.js"
cp apps-script/static/appsscript.json "$deploy_dir/appsscript.json"
rm -f "$deploy_dir/Code.js"

"$clasp" push --force
