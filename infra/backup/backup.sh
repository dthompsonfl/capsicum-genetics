#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DATABASE_ADMIN_URL:=${DATABASE_URL:-}}"
: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL or DATABASE_URL is required}"
out_dir="${1:-./backups/capsicum-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"
script_dir="$(cd "$(dirname "$0")" && pwd)"

database_dump="$out_dir/database.dump"
pg_dump --format=custom --no-owner --no-privileges --file="$database_dump" "$DATABASE_ADMIN_URL"
"$script_dir/authority-snapshot.sh" "$DATABASE_ADMIN_URL" "$out_dir/database-authority.tsv"

object_status="not_configured"
if [[ -n "${S3_ENDPOINT:-}" && -n "${S3_BUCKET:-}" && -n "${S3_ACCESS_KEY_ID:-}" && -n "${S3_SECRET_ACCESS_KEY:-}" ]]; then
  command -v mc >/dev/null 2>&1 || { echo 'mc is required for object backup' >&2; exit 1; }
  alias_name="capsicum-backup-$$"
  trap 'mc alias remove "$alias_name" >/dev/null 2>&1 || true' EXIT
  mc alias set "$alias_name" "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
  mkdir -p "$out_dir/objects"
  mc mirror --overwrite --remove "$alias_name/$S3_BUCKET" "$out_dir/objects"
  (
    cd "$out_dir/objects"
    find . -type f -print0 | sort -z | xargs -0 -r sha256sum
  ) > "$out_dir/objects.sha256"
  object_status="complete"
fi

python3 - "$out_dir" "$object_status" <<'PY'
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
root = Path(sys.argv[1])
manifest = {
    "schemaVersion": "2.0",
    "createdAt": datetime.now(timezone.utc).isoformat(),
    "database": {
        "file": "database.dump",
        "authoritySnapshot": "database-authority.tsv",
    },
    "objects": {
        "status": sys.argv[2],
        "directory": "objects",
        "checksumFile": "objects.sha256",
    },
}
(root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
PY
(
  cd "$out_dir"
  find . -type f ! -name 'bundle.sha256' -print0 | sort -z | xargs -0 sha256sum > bundle.sha256
)
printf 'Backup bundle written to %s\n' "$out_dir"
