# Verified Technology and Standards Baseline

Verified on 2026-07-22. The implementation agent must still select current compatible patch versions and record them in the final report.

| Technology/standard | Baseline | Official source |
|---|---|---|
| Node.js | 24 LTS; production should use an LTS line | https://nodejs.org/en/about/previous-releases |
| Next.js | 16.2 major/minor baseline | https://nextjs.org/blog/next-16-2 |
| AI SDK | 6.0 generation | https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0 |
| PostgreSQL | 18 current stable major; use current minor | https://www.postgresql.org/docs/current/index.htm |
| MIAPPE | 1.2, October 2024; compatible with 1.1 | https://www.miappe.org/releases/ |
| BrAPI | 2.1 latest stable and recommended for new development | https://brapi.org/specification |

Do not use PostgreSQL 19 beta in production. Do not bind the application to every BrAPI endpoint; implement only approved modules after internal contracts stabilize.
