import { z } from 'zod';

const OPTION_TYPES = ['select', 'radio', 'checkbox'] as const;

// ── Condition schemas ────────────────────────────────────────────────────────

const ConditionClauseSchema = z.object({
  fieldName: z.string().min(1).max(64),
  operator:  z.enum(['eq', 'neq', 'contains', 'notContains', 'empty', 'notEmpty']),
  value:     z.string().max(255).default(''),
});

const ConditionalRuleSchema = z.object({
  when:         z.array(ConditionClauseSchema).min(1).max(10),
  logic:        z.enum(['AND', 'OR']).default('AND'),
  visibility:   z.enum(['show', 'hide']).optional(),
  requirement:  z.enum(['require', 'optional']).optional(),
}).refine(
  r => r.visibility !== undefined || r.requirement !== undefined,
  { message: 'A conditional rule must set at least one of visibility or requirement' },
);

// ── Field schema ─────────────────────────────────────────────────────────────

const FormFieldDefSchema = z.object({
  name:           z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'name must be a valid identifier'),
  label:          z.string().min(1).max(128),
  type:           z.enum(['text', 'textarea', 'richtext', 'select', 'radio', 'checkbox', 'date', 'email', 'number', 'attachment']),
  required:       z.boolean(),
  placeholder:    z.string().max(255).optional(),
  helpText:       z.string().max(500).optional(),
  options:        z.array(z.string().min(1).max(128)).optional(),
  sortOrder:       z.number().int().min(0).max(999),
  defaultVisible:  z.boolean().optional(),
  displayLocation: z.enum(['left', 'right', 'hidden']).optional(),
  conditions:      z.array(ConditionalRuleSchema).max(20).optional(),
}).refine(
  (f) => !OPTION_TYPES.includes(f.type as typeof OPTION_TYPES[number]) || (Array.isArray(f.options) && f.options.length > 0),
  { message: 'select/radio/checkbox fields must have at least one option' },
);

export const FieldSchemaArraySchema = z.array(FormFieldDefSchema).min(1).max(50)
  .superRefine((fields, ctx) => {
    const names = new Set(fields.map(f => f.name));

    // 1. Field names must be unique
    if (names.size !== fields.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'field names must be unique within a template' });
      return;
    }

    // 2. Condition clauses must reference existing fields; no self-references
    fields.forEach((field, fi) => {
      field.conditions?.forEach((rule, ri) => {
        rule.when.forEach((clause, ci) => {
          if (!names.has(clause.fieldName)) {
            ctx.addIssue({
              code:    z.ZodIssueCode.custom,
              path:    [fi, 'conditions', ri, 'when', ci, 'fieldName'],
              message: `condition references unknown field "${clause.fieldName}"`,
            });
          }
          if (clause.fieldName === field.name) {
            ctx.addIssue({
              code:    z.ZodIssueCode.custom,
              path:    [fi, 'conditions', ri, 'when', ci, 'fieldName'],
              message: `field "${field.name}" cannot reference itself in a condition`,
            });
          }
        });
      });
    });

    // 3. Cycle detection via DFS over the dependency graph
    const deps = new Map<string, Set<string>>();
    for (const f of fields) {
      const d = new Set<string>();
      for (const rule of f.conditions ?? []) {
        for (const c of rule.when) d.add(c.fieldName);
      }
      deps.set(f.name, d);
    }

    const visiting = new Set<string>();
    const visited  = new Set<string>();
    let cycleDetected = false;

    function hasCycle(node: string): boolean {
      if (visiting.has(node)) return true;
      if (visited.has(node))  return false;
      visiting.add(node);
      for (const dep of deps.get(node) ?? []) {
        if (hasCycle(dep)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    }

    for (const name of names) {
      if (!cycleDetected && hasCycle(name)) {
        cycleDetected = true;
        ctx.addIssue({
          code:    z.ZodIssueCode.custom,
          message: `circular dependency detected in conditional rules (field "${name}" is in a cycle)`,
        });
      }
    }
  });

// ── Template-level schemas ───────────────────────────────────────────────────

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
