#!/usr/bin/env Rscript
# Research-only R worker boundary. AlphaSimR is intentionally not invoked until
# package availability, version pinning, and a promoted research protocol exist.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) > 0 && args[[1]] == "health") {
  cat('{"status":"ok","worker":"r","authority":"research_only"}\n')
} else {
  cat('{"status":"model_unavailable","authority":"research_only","reason":"No approved AlphaSimR protocol is installed."}\n')
}
