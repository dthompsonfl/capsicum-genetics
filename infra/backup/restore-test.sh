#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${ALLOW_DESTRUCTIVE_RESTORE_TEST:?Set ALLOW_DESTRUCTIVE_RESTORE_TEST=YES for an isolated disposable database}"
[[ "$ALLOW_DESTRUCTIVE_RESTORE_TEST" == "YES" ]] || { echo 'Restore test refused: explicit isolation acknowledgement missing.' >&2; exit 1; }
bundle="${1:?backup bundle directory required}"
[[ -d "$bundle" && -f "$bundle/manifest.json" && -f "$bundle/database.dump" ]] || { echo 'Invalid backup bundle.' >&2; exit 1; }
bundle="$(cd "$bundle" && pwd)"
script_dir="$(cd "$(dirname "$0")" && pwd)"
(
  cd "$bundle"
  sha256sum -c bundle.sha256
  [[ ! -f objects.sha256 ]] || (cd objects && sha256sum -c ../objects.sha256)
)
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" "$bundle/database.dump"
"$script_dir/authority-snapshot.sh" "$RESTORE_DATABASE_URL" "$bundle/database-authority-restored.tsv"
diff -u "$bundle/database-authority.tsv" "$bundle/database-authority-restored.tsv"
rm -f "$bundle/database-authority-restored.tsv"

if [[ -f "$bundle/objects.sha256" ]]; then
  : "${RESTORE_S3_ENDPOINT:?RESTORE_S3_ENDPOINT is required for object restore validation}"
  : "${RESTORE_S3_BUCKET:?RESTORE_S3_BUCKET is required for object restore validation}"
  : "${RESTORE_S3_ACCESS_KEY_ID:?RESTORE_S3_ACCESS_KEY_ID is required}"
  : "${RESTORE_S3_SECRET_ACCESS_KEY:?RESTORE_S3_SECRET_ACCESS_KEY is required}"
  : "${ALLOW_DESTRUCTIVE_OBJECT_RESTORE_TEST:?Set ALLOW_DESTRUCTIVE_OBJECT_RESTORE_TEST=YES for an isolated disposable bucket}"
  [[ "$ALLOW_DESTRUCTIVE_OBJECT_RESTORE_TEST" == "YES" ]] || { echo 'Object restore refused: isolated-bucket acknowledgement missing.' >&2; exit 1; }
  command -v mc >/dev/null 2>&1 || { echo 'mc is required for object restore validation' >&2; exit 1; }
  alias_name="capsicum-restore-$$"
  verify_dir="$(mktemp -d)"
  trap 'mc alias remove "$alias_name" >/dev/null 2>&1 || true; rm -rf "$verify_dir"' EXIT
  mc alias set "$alias_name" "$RESTORE_S3_ENDPOINT" "$RESTORE_S3_ACCESS_KEY_ID" "$RESTORE_S3_SECRET_ACCESS_KEY" >/dev/null
  mc mirror --overwrite --remove "$bundle/objects" "$alias_name/$RESTORE_S3_BUCKET"
  mc mirror --overwrite --remove "$alias_name/$RESTORE_S3_BUCKET" "$verify_dir/objects"
  (
    cd "$verify_dir/objects"
    find . -type f -print0 | sort -z | xargs -0 -r sha256sum > "$verify_dir/objects.sha256"
  )
  diff -u "$bundle/objects.sha256" "$verify_dir/objects.sha256"
fi
printf 'Isolated restore validation completed successfully.\n'
