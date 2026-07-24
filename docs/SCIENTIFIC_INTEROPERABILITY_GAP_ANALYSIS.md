# Scientific interoperability gap analysis

## Current position

The platform has strong internal identity, provenance, correction, evidence, and exact-calculation contracts. It does **not** currently claim conformance with MIAPPE, BrAPI, MCPD, or FAIR. V8 makes that non-conformance explicit in laboratory export metadata.

## MIAPPE

MIAPPE v1.2 was released in October 2024 and remains compatible with v1.1. The platform contains related concepts—investigation-like workspaces, experiments, biological material, observation units, variables, environments, events, methods, and observations—but it does not yet provide an approved field mapping, required-field coverage matrix, controlled-vocabulary policy, serialization profile, or conformance fixtures.

Required implementation work:

1. Map each MIAPPE v1.2 field to one canonical internal source.
2. Identify unsupported and conditionally supported fields.
3. Add controlled vocabulary and persistent-identifier policies.
4. Generate versioned export fixtures.
5. Validate round trips and missing-field behavior.
6. Publish an explicit conformance statement limited to the validated profile.

Official reference: https://www.miappe.org/releases/

## BrAPI

BrAPI 2.1 remains the latest stable release recommended by the BrAPI project for new development. The platform should not implement all endpoints. It should select modules around verified exchange use cases such as germplasm, studies, observation variables, observations, images, samples, crosses, pedigrees, and variants.

Required implementation work:

1. Define identifier and pagination behavior.
2. Map authorization and workspace boundaries.
3. Select supported BrAPI modules and calls.
4. Add JSON Schema/OpenAPI contract tests.
5. Validate with BrAPI tools and independent client fixtures.
6. Document unsupported calls and extension fields.

Official reference: https://brapi.org/specification

## MCPD

MCPD v2.1 is an international standard for passport data for ex situ genebank accessions. The current accession model stores useful identity and provenance data but lacks a validated MCPD field mapping and exchange artifact.

Required implementation work:

1. Map institute, accession, taxonomy, collecting, acquisition, biological-status, MLS, DOI, and related passport fields.
2. Preserve source vocabulary and unknown values without invention.
3. Add import/export validation and conflict handling.
4. Define local-only fields separately from the MCPD payload.

Official reference: https://www.fao.org/plant-treaty/news/news-detail/Updated-version-of-the-Multi-Crop-Passport-Descriptors/

## FAIR

FAIR requires more than downloadable JSON. Research objects should be findable, accessible under explicit policy, interoperable through formal representations and vocabularies, and reusable with rich metadata, licenses, provenance, and domain standards.

Current strengths:

- stable internal UUID identities;
- immutable histories and checksums;
- explicit evidence and correction states;
- versioned calculation and export schemas;
- source-revision provenance.

Current gaps:

- no global persistent-identifier policy;
- no dataset landing-page/indexing contract;
- no machine-readable data-use license in exports;
- incomplete community-standard mappings;
- no formal vocabulary/ontology governance;
- no public metadata-retention policy when underlying data are withdrawn;
- no validated qualified-link model for external research objects.

Primary reference: https://www.nature.com/articles/sdata201618

## Recommended sequence

1. Finish engineering and laboratory validation.
2. Implement MIAPPE v1.2 export first because experiment and observation metadata are the closest fit.
3. Implement MCPD v2.1 for accession exchange.
4. Implement only the BrAPI 2.1 calls needed by named partner systems.
5. Add persistent identifiers, licensing, indexable metadata, and qualified links for a defined FAIR publication profile.
6. Validate each profile with external fixtures and independent consumers before making a conformance claim.
