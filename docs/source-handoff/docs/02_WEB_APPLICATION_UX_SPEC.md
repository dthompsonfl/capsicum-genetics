# Web Application UX Specification

## Interface mandate

The product is a responsive web application. It must work well on desktop, tablet, and modern mobile browsers. The primary experience is not a developer console. It must guide growers and breeders who may have little genetics or software experience.

## Design standard

- WCAG 2.2 AA target.
- Keyboard-complete workflows.
- Semantic HTML and visible focus.
- Responsive layouts without horizontal page scrolling.
- Plain-language explanations with scientific details available progressively.
- Every destructive or scientifically authoritative action requires explicit confirmation.
- Empty, loading, partial, error, offline/degraded, and permission-denied states are designed—not omitted.
- Never communicate scientific state by color alone.

## Primary navigation

```text
Dashboard
Breeding
  Germplasm
  Seed Lots
  Plants
  Crosses
  Families and Progeny
  Pedigrees
Simulations
  New Simulation
  Saved Runs
  Targets and Selection Plans
Phenotyping
  Experiments
  Observation Sessions
  Images and Measurements
  Annotation Queue
Science
  Evidence Catalog
  Sources
  Candidate Claims
  Review Queue
AI Copilot
Reports and Exports
Administration
```

## Required route map

```text
/
/sign-in
/onboarding
/dashboard
/germplasm
/germplasm/new
/germplasm/[id]
/seed-lots
/seed-lots/[id]
/plants
/plants/[id]
/crosses
/crosses/new
/crosses/[id]
/families/[id]
/pedigrees/[materialId]
/simulations
/simulations/new
/simulations/[id]
/selection-plans
/selection-plans/[id]
/experiments
/experiments/[id]
/observations/session/[id]
/phenotypes/images
/phenotypes/images/[id]
/annotations
/catalog
/catalog/loci/[id]
/catalog/claims/[id]
/catalog/releases/[id]
/research/sources/[id]
/research/review
/ai
/reports
/settings/workspace
/settings/users
/admin/jobs
/admin/models
/admin/audit
/admin/system
```

## Dashboard

Show actionable operational information:

- planned crosses due today;
- pollinated flowers awaiting fruit-set review;
- seed lots approaching low inventory;
- plants needing observations;
- failed image-quality checks;
- simulation runs requiring assumption review;
- evidence claims awaiting review;
- jobs or model runs needing attention;
- recent selections and harvests.

Do not make vanity charts the primary dashboard content.

## Cross-planning workflow

1. Select a maternal parent and paternal parent.
2. Display species, seed lot, pedigree, known genotypes, assumed genotypes, and identity warnings.
3. Choose approved loci, traits, and target outcomes.
4. Review model applicability and excluded predictions.
5. Resolve or acknowledge unknown genotype states.
6. Run exact simulation or select an approved advanced model.
7. Present genotype, phenotype, and uncertainty distributions separately.
8. Calculate target recovery and adjusted planting requirements.
9. Save the simulation snapshot.
10. Create a planned cross and observation protocol.

## Simulation result page

Always display:

- result authority label;
- input parent identities and direction;
- genotype evidence statuses;
- model and catalog release versions;
- exact versus sampled calculation;
- assumptions and exclusions;
- probability distributions;
- target probability and population calculation;
- scientific sources and applicable populations;
- warnings and abstentions;
- reproducibility identifier;
- action to create a breeding plan.

## Material identity workflow

Support printable and QR labels for seed lots, plants, pollinated flowers, fruits, tissue samples, and seed harvests. Scanning must open the correct record and prevent operators from accidentally assigning observations to the wrong biological material.

## Phenotype capture workflow

1. Scan or select the material.
2. Choose the observation protocol.
3. Show capture instructions and calibration requirements.
4. Capture/upload images.
5. Run quality checks before analysis.
6. Present deterministic measurements and model suggestions.
7. Require human correction/approval for authoritative observations.
8. Store raw image, derived mask, calibration, model version, edits, and final observation.

## Scientific review workflow

Candidate claims move through:

```text
draft -> extracted -> curator_review -> independent_review -> approved -> released
                                           |                |
                                           -> rejected      -> superseded
```

The interface must show source passages next to extracted assertions. Reviewers must be able to record disagreement, limitations, species/population scope, and prohibited interpretations.

## AI Copilot UX

AI responses must show:

- answer class: explanation, evidence summary, workflow help, or tool result;
- citations to source passages or internal records;
- tools called and simulation run identifiers;
- uncertainty and missing data;
- actions that require human approval;
- an obvious way to report an incorrect answer.

Do not display AI prose as an authoritative genotype or scientific rule.
