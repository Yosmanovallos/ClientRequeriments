import { z } from 'zod';

const FormFieldDefSchema = z.object({
  name:        z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'name must be a valid identifier'),
  label:       z.string().min(1).max(128),
  type:        z.enum(['text', 'textarea', 'select', 'date', 'email', 'number']),
  required:    z.boolean(),
  placeholder: z.string().max(255).optional(),
  options:     z.array(z.string().min(1).max(128)).optional(),
  sortOrder:   z.number().int().min(0).max(999),
}).refine(
  // select fields must have options
  (f) => f.type !== 'select' || (Array.isArray(f.options) && f.options.length > 0),
  { message: 'select-type fields must have at least one option' },
).refine(
  // non-select fields must NOT have options
  (f) => f.type === 'select' || !f.options,
  { message: 'options is only allowed for select-type fields' },
);

export const FieldSchemaArraySchema = z.array(FormFieldDefSchema).min(1).max(50)
  .refine(
    // Field names must be unique within a template
    (fields) => new Set(fields.map(f => f.name)).size === fields.length,
    { message: 'field names must be unique within a template' },
  );

const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const CreateTemplateSchema = z.object({
  name:        z.string().min(1).max(128),
  slug:        z.string().min(1).max(64).regex(SLUG_RX, 'slug must be lowercase letters, digits, and hyphens'),
  description: z.string().max(2000).nullable().optional(),
  fieldSchema: FieldSchemaArraySchema,
  /** SuperAdmin-only: target a specific client. */
  clientId:    z.string().uuid().optional(),
});

export const UpdateTemplateSchema = z.object({
  name:        z.string().min(1).max(128).optional(),
  description: z.string().max(2000).nullable().optional(),
  fieldSchema: FieldSchemaArraySchema.optional(),
});

export const ConfigureProjectFormsSchema = z.object({
  configs: z.array(z.object({
    templateId: z.string().uuid(),
    isEnabled:  z.boolean(),
    sortOrder:  z.number().int().min(0).max(999).optional(),
  })),
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
