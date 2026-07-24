import { z } from 'zod';

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const requestId = z.string().trim().min(8).max(200);

export const researchDocumentIngestionSchema = z.object({
  schemaVersion: z.literal('1.0'),
  title: z.string().trim().min(3).max(500),
  sourceLocator: z.string().trim().min(3).max(2_000),
  documentVersion: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(255),
  mediaType: z.enum(['text/plain', 'text/markdown', 'application/pdf']),
  byteLength: z.number().int().min(1).max(25 * 1024 * 1024),
  sourceSha256: sha256,
  objectKey: z.string().trim().min(1).max(2_000),
  clientRequestId: requestId,
  traceId: requestId,
  supersedesDocumentId: uuid.optional(),
});

export const researchPassageDraftSchema = z.object({
  passageIndex: z.number().int().min(0).max(100_000),
  passageText: z.string().trim().min(1).max(50_000),
  passageSha256: sha256,
  tokenCount: z.number().int().min(0).max(100_000),
  characterStart: z.number().int().min(0),
  characterEnd: z.number().int().positive(),
  locator: z.string().trim().min(1).max(2_000),
});

export type ResearchDocumentIngestionInput = z.infer<typeof researchDocumentIngestionSchema>;
export type ResearchPassageDraft = z.infer<typeof researchPassageDraftSchema>;
