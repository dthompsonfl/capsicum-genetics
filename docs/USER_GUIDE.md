# Capsicum Intelligence user guide

## What this system is for

Capsicum Intelligence helps a breeder preserve biological identity, plan crosses, calculate inheritance from explicit assumptions, record observations, compare expected and observed segregation, and retain evidence for later review.

It is designed for beginners, hobbyists, seed stewards, researchers, and breeding teams. The interface uses plain-language **seed parent** and **pollen parent** terms while preserving the maternal/paternal direction required by the data model.

## What it cannot determine by itself

The platform does not infer a trustworthy genotype from a cultivar name, fruit appearance, seller description, or photograph. It does not promise exact heat, flavor, yield, color, shape, or disease outcomes from a single locus unless a reviewed rule explicitly supports that claim for the applicable population and method.

A probability is not a guarantee for an individual seed or plant.

## The shortest useful workflow

### 1. Learn with a temporary calculation

Open **Learn → Quick Genetics**. Enter one locus and the two alleles for each parent. The calculator returns exact genotype fractions and percentages without creating permanent records.

Use this to answer questions such as:

- What genotypes are expected from `A/a × a/a`?
- How many seeds are needed for a chosen chance of recovering at least one target genotype?
- How do germination and survival reduce the number of observable plants?

Do not assign biological meaning to `A` or `a` unless your evidence defines it. Capitalization does not prove dominance.

### 2. Add germplasm

Create one accession record for each distinct biological source. Record:

- the name used by the supplier or breeder;
- a unique internal accession code;
- source organization or person;
- source identifier, packet number, or exchange reference;
- receipt date and notes;
- species only when supported.

Do not merge two seed sources merely because they use the same cultivar name.

### 3. Create seed lots

A seed lot represents a physical group of seeds with one origin. Record the quantity, unit, storage location, harvest or receipt context, and parent material where applicable.

Create a new lot when provenance changes. Never silently add unrelated seeds to an existing lot.

### 4. Register plants

Every plant used for crossing, observation, or selection receives a unique plant code and a connection to its seed lot or family.

Record failures too. Germination failure, mortality, contamination, off-types, and accidental pollination are scientifically useful outcomes.

### 5. Record genotype evidence

A genotype call must distinguish:

- **verified** — supported by the recorded assay and review standard;
- **inferred** — concluded from other evidence with stated reasoning;
- **assumed** — used as a working hypothesis;
- **unknown** — no usable call exists;
- **conflicting** — credible evidence disagrees.

Preserve assay name, laboratory or protocol, date, source file, and reviewer where available.

### 6. Plan and perform a cross

Choose an actual plant as the **seed parent** and another as the **pollen parent**. Parent direction is not interchangeable for cytoplasmic or maternal effects.

Record:

- planned and actual dates;
- pollination method;
- flower and isolation details;
- labels or bag identifiers;
- success, failure, contamination, or uncertainty;
- harvested fruit and resulting seed lot.

### 7. Calculate expected inheritance

Open **Breeding → Simulation Lab**.

Use the modes in this order:

1. **Standard exact inheritance** — use when parent genotypes are explicit and the model assumptions are appropriate.
2. **Uncertain parent genotypes** — use weighted hypotheses when multiple parent genotypes remain plausible.
3. **Advanced research models** — use linkage, recombination, cytoplasmic inheritance, penetrance, or bounded Monte Carlo only when the required evidence and interpretation are understood.

Before saving a result, confirm every assumption. The software can calculate the consequence of a premise; it cannot prove the premise is biologically true.

### 8. Build a population plan

For a target genotype with probability `p`, the platform can calculate how many independent offspring are required for a chosen probability of seeing at least one target.

Adjust for expected germination, survival, observation, and assay success. Keep these operational rates separate from the inheritance probability.

### 9. Observe and measure

Use a defined protocol whenever possible. Record:

- material and plant identity;
- date, developmental stage, and environment;
- trait, value, unit, and instrument;
- protocol and operator;
- image view and scale/color references when required;
- correction reason if a measurement must be superseded.

The phenotype capture form binds each image to its biological material automatically and offers only approved protocol views.

### 10. Select and preserve seed

Write the selection rule before choosing plants. Record all evaluated candidates, not only winners. Keep selection pressure, population size, measured traits, disqualifiers, and retained plants visible.

Harvested seed creates a new lot with explicit parent and harvest provenance.

## Navigation guide

- **Home** — setup status, recent work, and next actions.
- **Learn** — plain-language guide and temporary genetics calculator.
- **Materials** — germplasm, seed lots, and individual plants.
- **Breeding** — crosses, pedigrees, simulations, selection plans, and experiments.
- **Measurements** — observation sessions, images, phenotype capture, and annotations.
- **Evidence** — catalog, reviewed sources, research assistance, and scientific review.
- **Reports** — breeding-ledger exports and operational summaries.
- **Settings** — workspace, users, sessions, MFA, and administrative controls.

Navigation is role-aware. A user sees only the sections available to their current workspace role.

## Good records

Good records are specific, contemporaneous, and honest about uncertainty. Use unique codes. Preserve original observations. Correct mistakes through revision records instead of rewriting history. Record negative and unexpected results. Keep assumptions separate from verified evidence.

## Common mistakes to avoid

- Treating a cultivar name as a genotype.
- Reversing seed and pollen parents.
- Using advanced linkage or cytoplasmic modes without evidence.
- Combining measurements taken with incompatible protocols.
- Reporting only selected survivors.
- Reusing a plant, seed-lot, or accession code.
- Claiming a phenotype from an unreviewed marker association.
- Treating a calculated percentage as a guaranteed result.

## Account security

Privileged users must enroll multi-factor authentication. Store recovery codes offline. Rotating recovery codes invalidates all prior codes. Review active sessions under **Settings → Sessions** and revoke unfamiliar sessions immediately.
