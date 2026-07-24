#!/usr/bin/env bash
set -euo pipefail
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/source/objects/a"
printf database > "$root/source/database.dump"
printf object > "$root/source/objects/a/file"
(
  cd "$root/source"
  find . -type f ! -name bundle.sha256 -print0 | sort -z | xargs -0 sha256sum > bundle.sha256
  sha256sum -c bundle.sha256 >/dev/null
)
cp -a "$root/source" "$root/relocated"
rm -rf "$root/source"
(cd "$root/relocated" && sha256sum -c bundle.sha256 >/dev/null)
printf tamper >> "$root/relocated/database.dump"
if (cd "$root/relocated" && sha256sum -c bundle.sha256 >/dev/null 2>&1); then
  echo 'tamper verification unexpectedly passed' >&2
  exit 1
fi
printf 'relocated bundle verification and tamper rejection passed\n'
