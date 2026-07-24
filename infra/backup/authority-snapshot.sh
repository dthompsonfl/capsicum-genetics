#!/usr/bin/env bash
set -euo pipefail
connection_url="${1:?database URL required}"
output="${2:?output file required}"
tables_file="${3:-$(cd "$(dirname "$0")" && pwd)/authoritative-tables.tsv}"
temporary="$(mktemp)"
trap 'rm -f "$temporary" "$temporary.rows"' EXIT
printf 'table\trow_count\tsha256\n' > "$temporary"
while IFS=$'\t' read -r table order_by; do
  [[ -n "$table" && "$table" =~ ^[a-z0-9_]+$ ]] || continue
  [[ "$order_by" =~ ^[a-z0-9_,]+$ ]] || { echo "unsafe order expression for $table" >&2; exit 1; }
  count="$(psql "$connection_url" -v ON_ERROR_STOP=1 -Atc "SELECT count(*)::bigint FROM \"$table\"")"
  psql "$connection_url" -v ON_ERROR_STOP=1 -Atc "COPY (SELECT to_jsonb(row_data)::text FROM \"$table\" row_data ORDER BY $order_by) TO STDOUT" > "$temporary.rows"
  digest="$(sha256sum "$temporary.rows" | awk '{print $1}')"
  printf '%s\t%s\t%s\n' "$table" "$count" "$digest" >> "$temporary"
done < "$tables_file"
mv "$temporary" "$output"
