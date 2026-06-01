import { z } from 'zod';
import { REQUEST_TYPES } from './Request';

export const CreateRequestSchema = z.object({
  requestType:    z.enum(REQUEST_TYPES),
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
