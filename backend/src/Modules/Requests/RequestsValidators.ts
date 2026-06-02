import { z } from 'zod';

const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const CreateRequestSchema = z.object({
  requestType:    z.string().regex(SLUG_RX, 'requestType must be a valid form-template slug'),
  title:          z.string().min(1).max(255),
  priority:       z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).default('Medium'),
  dueDate:        z.string().date().nullable().optional(),
  payload:        z.record(z.unknown()).default({}),
  idempotencyKey: z.string().max(64).nullable().optional(),
  projectId:      z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  templateId:     z.string().uuid().nullable().optional(),
});

export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;

export const ListRequestsSchema = z.object({
  status:    z.string().optional(),
  projectId: z.string().uuid().optional(),
});
