# Web route inventory

**Generated from current V7 source:** 2026-07-23
**Page routes:** 57
**API routes:** 14

Route presence is inventory evidence, not a production-readiness claim. Governed gates deliberately abstain or remain unavailable when evidence, review, or infrastructure is absent.

## Page routes

| Route | Status | Source |
|---|---|---|
| `/accept-invitation` | `implemented` | `apps/web/src/app/accept-invitation/page.tsx` |
| `/admin/audit` | `implemented` | `apps/web/src/app/admin/audit/page.tsx` |
| `/admin/jobs` | `implemented` | `apps/web/src/app/admin/jobs/page.tsx` |
| `/admin/models` | `implemented / governed gate` | `apps/web/src/app/admin/models/page.tsx` |
| `/admin/system` | `implemented` | `apps/web/src/app/admin/system/page.tsx` |
| `/ai` | `implemented` | `apps/web/src/app/ai/page.tsx` |
| `/annotations` | `implemented` | `apps/web/src/app/annotations/page.tsx` |
| `/breeding-ledger` | `implemented` | `apps/web/src/app/breeding-ledger/page.tsx` |
| `/catalog/claims/[id]` | `implemented / governed gate` | `apps/web/src/app/catalog/claims/[id]/page.tsx` |
| `/catalog/loci/[id]` | `implemented / governed gate` | `apps/web/src/app/catalog/loci/[id]/page.tsx` |
| `/catalog/normalized` | `implemented` | `apps/web/src/app/catalog/normalized/page.tsx` |
| `/catalog` | `implemented / governed gate` | `apps/web/src/app/catalog/page.tsx` |
| `/catalog/releases/[id]` | `implemented / governed gate` | `apps/web/src/app/catalog/releases/[id]/page.tsx` |
| `/crosses/[id]` | `implemented` | `apps/web/src/app/crosses/[id]/page.tsx` |
| `/crosses/new` | `implemented` | `apps/web/src/app/crosses/new/page.tsx` |
| `/crosses` | `implemented` | `apps/web/src/app/crosses/page.tsx` |
| `/dashboard` | `alias` | `apps/web/src/app/dashboard/page.tsx` |
| `/experiments/[id]` | `implemented` | `apps/web/src/app/experiments/[id]/page.tsx` |
| `/experiments` | `implemented` | `apps/web/src/app/experiments/page.tsx` |
| `/families/[id]` | `implemented` | `apps/web/src/app/families/[id]/page.tsx` |
| `/forgot-password` | `implemented` | `apps/web/src/app/forgot-password/page.tsx` |
| `/germplasm/[id]` | `implemented` | `apps/web/src/app/germplasm/[id]/page.tsx` |
| `/germplasm/new` | `implemented` | `apps/web/src/app/germplasm/new/page.tsx` |
| `/germplasm` | `implemented` | `apps/web/src/app/germplasm/page.tsx` |
| `/help` | `implemented` | `apps/web/src/app/help/page.tsx` |
| `/observations/session/[id]` | `implemented` | `apps/web/src/app/observations/session/[id]/page.tsx` |
| `/onboarding` | `implemented` | `apps/web/src/app/onboarding/page.tsx` |
| `/` | `implemented` | `apps/web/src/app/page.tsx` |
| `/pedigrees/[materialId]` | `implemented` | `apps/web/src/app/pedigrees/[materialId]/page.tsx` |
| `/phenotype-capture/[id]` | `implemented / governed gate` | `apps/web/src/app/phenotype-capture/[id]/page.tsx` |
| `/phenotype-capture` | `implemented / governed gate` | `apps/web/src/app/phenotype-capture/page.tsx` |
| `/phenotypes/images/[id]` | `implemented` | `apps/web/src/app/phenotypes/images/[id]/page.tsx` |
| `/phenotypes/images` | `implemented` | `apps/web/src/app/phenotypes/images/page.tsx` |
| `/plants/[id]` | `implemented` | `apps/web/src/app/plants/[id]/page.tsx` |
| `/plants` | `implemented` | `apps/web/src/app/plants/page.tsx` |
| `/quick-genetics` | `implemented` | `apps/web/src/app/quick-genetics/page.tsx` |
| `/reports` | `implemented` | `apps/web/src/app/reports/page.tsx` |
| `/research` | `implemented` | `apps/web/src/app/research/page.tsx` |
| `/research/review` | `implemented / governed gate` | `apps/web/src/app/research/review/page.tsx` |
| `/research/sources/[id]` | `implemented` | `apps/web/src/app/research/sources/[id]/page.tsx` |
| `/research-assistant` | `implemented / governed gate` | `apps/web/src/app/research-assistant/page.tsx` |
| `/reset-password` | `implemented` | `apps/web/src/app/reset-password/page.tsx` |
| `/scan/[token]` | `implemented` | `apps/web/src/app/scan/[token]/page.tsx` |
| `/scientific-catalog` | `implemented / governed gate` | `apps/web/src/app/scientific-catalog/page.tsx` |
| `/seed-lots/[id]` | `implemented` | `apps/web/src/app/seed-lots/[id]/page.tsx` |
| `/seed-lots` | `implemented` | `apps/web/src/app/seed-lots/page.tsx` |
| `/selection-plans/[id]` | `implemented` | `apps/web/src/app/selection-plans/[id]/page.tsx` |
| `/selection-plans` | `implemented` | `apps/web/src/app/selection-plans/page.tsx` |
| `/settings/security` | `implemented` | `apps/web/src/app/settings/security/page.tsx` |
| `/settings/sessions` | `implemented` | `apps/web/src/app/settings/sessions/page.tsx` |
| `/settings/users` | `implemented` | `apps/web/src/app/settings/users/page.tsx` |
| `/settings/workspace` | `implemented` | `apps/web/src/app/settings/workspace/page.tsx` |
| `/sign-in` | `implemented` | `apps/web/src/app/sign-in/page.tsx` |
| `/simulation-lab` | `implemented` | `apps/web/src/app/simulation-lab/page.tsx` |
| `/simulations/[id]` | `implemented` | `apps/web/src/app/simulations/[id]/page.tsx` |
| `/simulations/new` | `alias` | `apps/web/src/app/simulations/new/page.tsx` |
| `/simulations` | `implemented` | `apps/web/src/app/simulations/page.tsx` |

## API routes

| Route | Status | Source |
|---|---|---|
| `/api/auth/invitation/exchange` | `implemented` | `apps/web/src/app/api/auth/invitation/exchange/route.ts` |
| `/api/auth/password-reset/exchange` | `implemented` | `apps/web/src/app/api/auth/password-reset/exchange/route.ts` |
| `/api/exports/[id]` | `implemented` | `apps/web/src/app/api/exports/[id]/route.ts` |
| `/api/exports/breeding-ledger` | `implemented` | `apps/web/src/app/api/exports/breeding-ledger/route.ts` |
| `/api/health/liveness` | `implemented` | `apps/web/src/app/api/health/liveness/route.ts` |
| `/api/health/readiness` | `implemented` | `apps/web/src/app/api/health/readiness/route.ts` |
| `/api/health` | `implemented` | `apps/web/src/app/api/health/route.ts` |
| `/api/media/[id]/derivative/[type]` | `implemented` | `apps/web/src/app/api/media/[id]/derivative/[type]/route.ts` |
| `/api/media/[id]` | `implemented` | `apps/web/src/app/api/media/[id]/route.ts` |
| `/api/media/upload` | `implemented` | `apps/web/src/app/api/media/upload/route.ts` |
| `/api/research/upload` | `implemented` | `apps/web/src/app/api/research/upload/route.ts` |
| `/api/simulations/advanced` | `implemented` | `apps/web/src/app/api/simulations/advanced/route.ts` |
| `/api/simulations/exact` | `implemented` | `apps/web/src/app/api/simulations/exact/route.ts` |
| `/api/system/readiness` | `implemented` | `apps/web/src/app/api/system/readiness/route.ts` |

## Release interpretation

The source contains the routes listed above. Production acceptance still requires the frozen-install, Node 24 build, PostgreSQL authority, browser accessibility, integrated-service, security-scan, and restore evidence in `V7_RELEASE_BLOCKERS.md`.
