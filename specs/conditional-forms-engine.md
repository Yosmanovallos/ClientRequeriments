# Conditional Forms Engine — Technical Design

**Status:** Draft  
**Date:** 2026-05-31  
**Scope:** Back Office form builder + Client Portal request submission  
**Author:** Design session — not yet implemented

---

## 1. Executive Summary

This document specifies a Conditional Forms Engine that allows administrators to define field-level show/hide and required/optional rules directly in the Form Builder. Those rules are automatically enforced on the Client Portal when a user fills in a request — no page refresh, no code change.

The design stores conditional logic inside the existing `fieldSchema` JSON column on `form_templates`. No Prisma migration is required. The frontend runs the engine for real-time UX; the backend runs the same logic authoritatively at submission time.

---

## 2. Current Architecture (baseline)

### 2.1 Data model

`FormTemplate.fieldSchema` is stored as `String @db.Text` (JSON) — a serialised array of `FormFieldDef` objects:

```
FormFieldDef {
  name        string    — stable identifier; used as payload key + ADO mapping
  label       string
  type        FormFieldType
  required    boolean
  placeholder?string
  helpText?   string
  options?    string[]  — for select / radio / checkbox
  sortOrder   number    — display order (not evaluation order)
}
```

Supported types: `text | textarea | richtext | select | radio | checkbox | date | email | number | attachment`

### 2.2 Submission flow

1. `ViewDynamicForm` renders every field in `fieldSchema`; no fields are conditionally hidden today.
2. On submit: POST `/requests` with `{ requestType, title, priority, dueDate, projectId, organizationId, payload }`.
3. `payload` is `z.record(z.unknown())` — no per-field validation at the service layer.
4. **Known issue**: `ViewDynamicForm` stuffs `templateId` into `payload` (line 101). The `Request` row already has a dedicated `templateId` column. This must be fixed (§ 5.3).

### 2.3 Form builder

`ViewCPFormBuilder` renders a card per field. Each card has label, name, type, placeholder, options, help text, and required toggle. No condition configuration exists today.

---

## 3. Requirements Summary

| # | Requirement |
|---|------------|
| R1 | Admins configure conditional rules per field in the Form Builder; no code change needed |
| R2 | Rules support show/hide and require/optional effects |
| R3 | Trigger fields: dropdown, radio, checkbox, multi-select, boolean (yes/no) |
| R4 | Multiple conditions per field; AND / OR logic |
| R5 | Nested conditions (A → B → C → D) |
| R6 | Real-time evaluation in the portal (no page refresh) |
| R7 | Hidden fields are never validated as required |
| R8 | Hidden fields are stripped from the payload before submission |
| R9 | Server-side validation is the authoritative source of truth |
| R10 | Validation must respect conditions even if the frontend is bypassed |

---

## 4. Data Model Changes

### 4.1 New types (zero DB migration)

```typescript
// backend/src/Modules/FormTemplates/FormTemplate.ts — additions

export interface ConditionClause {
  fieldName: string;           // must name another field in the same template
  operator:  ConditionOperator;
  value:     string;           // ignored for 'empty' / 'notEmpty'
}

export type ConditionOperator =
  | 'eq'           // exact match (all types)
  | 'neq'          // not equal
  | 'contains'     // value is one of comma-separated selections (checkbox / multi)
  | 'notContains'  // value is NOT in selections
  | 'empty'        // field has no value
  | 'notEmpty';    // field has any value

export interface ConditionalRule {
  when:         ConditionClause[];     // 1–10 clauses
  logic?:       'AND' | 'OR';         // default 'AND'
  visibility?:  'show' | 'hide';      // omit → no effect on visibility
  requirement?: 'require' | 'optional'; // omit → no effect on required state
}
```

**Design note — two orthogonal properties:**  
`visibility` and `requirement` are separate optional properties on a rule. A single rule can change visibility only, requirement only, or both. This is cleaner than a single `effect` field that conflates two concerns and requires ordering semantics to resolve conflicts.

### 4.2 Updated FormFieldDef

```typescript
export interface FormFieldDef {
  name:           string;
  label:          string;
  type:           FormFieldType;
  required:       boolean;              // base required state (before conditions)
  placeholder?:   string;
  helpText?:      string;
  options?:       string[];
  sortOrder:      number;
  defaultVisible?: boolean;             // NEW — true if omitted
  conditions?:    ConditionalRule[];    // NEW — empty/absent = always show
}
```

**Backward compatibility:** existing fields with no `conditions` behave identically (`defaultVisible = true`, `required` unchanged).

### 4.3 Frontend mirror

```typescript
// frontend/src/api/formTemplates.ts — mirror the same types
// (TypeScript duplication is intentional; no shared package yet)
export type { ConditionClause, ConditionOperator, ConditionalRule } from './types';
```

---

## 5. Backend Changes

### 5.1 FormTemplateValidators.ts

Add Zod schemas for the new types and plug them into `FormFieldDefSchema`:

```typescript
const ConditionOperatorSchema = z.enum([
  'eq', 'neq', 'contains', 'notContains', 'empty', 'notEmpty',
]);

const ConditionClauseSchema = z.object({
  fieldName: z.string().min(1).max(64),
  operator:  ConditionOperatorSchema,
  value:     z.string().max(255).default(''),
});

const ConditionalRuleSchema = z.object({
  when:         z.array(ConditionClauseSchema).min(1).max(10),
  logic:        z.enum(['AND', 'OR']).default('AND'),
  visibility:   z.enum(['show', 'hide']).optional(),
  requirement:  z.enum(['require', 'optional']).optional(),
}).refine(
  r => r.visibility !== undefined || r.requirement !== undefined,
  { message: 'A rule must set at least one of visibility or requirement' },
);

// Add to FormFieldDefSchema:
defaultVisible: z.boolean().default(true).optional(),
conditions:     z.array(ConditionalRuleSchema).max(20).optional(),
```

**Cross-field validation in `FieldSchemaArraySchema`:**

```typescript
FieldSchemaArraySchema = z.array(FormFieldDefSchema)
  .min(1).max(50)
  .superRefine((fields, ctx) => {
    const names = new Set(fields.map(f => f.name));

    // 1. Field names unique (existing rule)
    if (new Set(fields.map(f => f.name)).size !== fields.length) {
      ctx.addIssue({ code: 'custom', message: 'field names must be unique' });
      return;
    }

    // 2. Condition references must point to existing fields (not self)
    fields.forEach((field, fi) => {
      field.conditions?.forEach((rule, ri) => {
        rule.when.forEach((clause, ci) => {
          if (!names.has(clause.fieldName)) {
            ctx.addIssue({
              code: 'custom',
              path: [fi, 'conditions', ri, 'when', ci, 'fieldName'],
              message: `"${clause.fieldName}" does not exist in this template`,
            });
          }
          if (clause.fieldName === field.name) {
            ctx.addIssue({
              code: 'custom',
              path: [fi, 'conditions', ri, 'when', ci, 'fieldName'],
              message: `Field "${field.name}" cannot reference itself`,
            });
          }
        });
      });
    });

    // 3. Cycle detection via DFS over the dependency graph
    const deps = new Map<string, Set<string>>();
    fields.forEach(f => {
      const fieldDeps = new Set<string>();
      f.conditions?.forEach(rule =>
        rule.when.forEach(c => fieldDeps.add(c.fieldName)),
      );
      deps.set(f.name, fieldDeps);
    });

    const visiting = new Set<string>();
    const visited  = new Set<string>();

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
      if (hasCycle(name)) {
        ctx.addIssue({
          code: 'custom',
          message: `Circular dependency detected involving field "${name}"`,
        });
        break;
      }
    }
  });
```

### 5.2 Condition evaluation utility (shared logic)

```typescript
// backend/src/Modules/FormTemplates/conditionEngine.ts

import type { FormFieldDef } from './FormTemplate.js';

export interface FieldState {
  visible:  boolean;
  required: boolean;
}

/**
 * Evaluate all conditional rules for a field set against a payload.
 * Uses topological sort so triggers are always evaluated before dependents.
 * Returns a Map<fieldName, FieldState> for every field.
 */
export function evaluateConditions(
  schema: FormFieldDef[],
  payload: Record<string, unknown>,
): Map<string, FieldState> {
  const sorted = topoSort(schema);
  const result = new Map<string, FieldState>();

  for (const field of sorted) {
    const visible  = resolveVisibility(field, payload, result);
    const required = resolveRequired(field, payload, result, visible);
    result.set(field.name, { visible, required });
  }

  return result;
}

function resolveVisibility(
  field:    FormFieldDef,
  payload:  Record<string, unknown>,
  resolved: Map<string, FieldState>,
): boolean {
  let visible = field.defaultVisible ?? true;
  for (const rule of field.conditions ?? []) {
    if (rule.visibility === undefined) continue;
    if (clausesMatch(rule.when, rule.logic ?? 'AND', payload, resolved)) {
      visible = rule.visibility === 'show';
    }
  }
  return visible;
}

function resolveRequired(
  field:     FormFieldDef,
  payload:   Record<string, unknown>,
  resolved:  Map<string, FieldState>,
  isVisible: boolean,
): boolean {
  if (!isVisible) return false;   // hidden fields are never required
  let required = field.required;
  for (const rule of field.conditions ?? []) {
    if (rule.requirement === undefined) continue;
    if (clausesMatch(rule.when, rule.logic ?? 'AND', payload, resolved)) {
      required = rule.requirement === 'require';
    }
  }
  return required;
}

function clausesMatch(
  clauses:  import('./FormTemplate.js').ConditionClause[],
  logic:    'AND' | 'OR',
  payload:  Record<string, unknown>,
  resolved: Map<string, FieldState>,
): boolean {
  const results = clauses.map(c => {
    // If the trigger is itself hidden, treat its value as empty
    const triggerVisible = resolved.get(c.fieldName)?.visible ?? true;
    const raw = triggerVisible ? String(payload[c.fieldName] ?? '') : '';
    return evalClause(c.operator, raw, c.value);
  });
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function evalClause(op: string, val: string, target: string): boolean {
  switch (op) {
    case 'eq':          return val === target;
    case 'neq':         return val !== target;
    case 'contains':    return val.split(',').map(s => s.trim()).includes(target);
    case 'notContains': return !val.split(',').map(s => s.trim()).includes(target);
    case 'empty':       return val === '';
    case 'notEmpty':    return val !== '';
    default:            return false;
  }
}

/**
 * Topological sort of fields by their dependency graph.
 * Fields with no dependencies come first; dependents come after their triggers.
 * Cycle-free (guaranteed by template validation).
 */
function topoSort(schema: FormFieldDef[]): FormFieldDef[] {
  const byName = new Map(schema.map(f => [f.name, f]));
  const deps   = new Map<string, Set<string>>();
  schema.forEach(f => {
    const d = new Set<string>();
    f.conditions?.forEach(r => r.when.forEach(c => d.add(c.fieldName)));
    deps.set(f.name, d);
  });

  const order: FormFieldDef[] = [];
  const visited = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    for (const dep of deps.get(name) ?? []) visit(dep);
    visited.add(name);
    const field = byName.get(name);
    if (field) order.push(field);
  }

  schema.forEach(f => visit(f.name));
  return order;
}
```

### 5.3 Fix: templateId in payload → top-level field

**Problem:** `ViewDynamicForm` puts `templateId` inside `payload`. The `Request` row already has a dedicated `templateId` column; two sources of truth are a bug.

**Fix (part of this feature, not a separate task):**

In `CreateRequestSchema` (`RequestsValidators.ts`), add:
```typescript
templateId: z.string().uuid().nullable().optional(),
```

In `ViewDynamicForm.tsx`, change:
```typescript
// Remove templateId from payload; pass as top-level field
payload: payloadValues,         // was: { ...payloadValues, templateId: template.id }
templateId: template.id,        // new top-level field
```

In `RequestsService.create()`, use `cmd.templateId` (already the column name) for template lookup.

### 5.4 Server-side condition-aware validation (RequestsService.ts)

After sanitising `cmd` and before saving the request:

```typescript
// New dependency — RequestsService now needs FormTemplatesRepository
// Injected in AdapterRegistration.ts (see § 5.5)

if (cmd.templateId) {
  const tpl = await this.deps.formTemplates.findById(cmd.templateId, cmd.clientId);
  if (tpl) {
    this.validatePayloadWithConditions(tpl.fieldSchema, cmd.payload as Record<string, unknown>);
  }
}
```

```typescript
private validatePayloadWithConditions(
  schema:  FormFieldDef[],
  payload: Record<string, unknown>,
): void {
  const states  = evaluateConditions(schema, payload);
  const errors: string[] = [];

  for (const field of schema) {
    const state = states.get(field.name) ?? { visible: true, required: field.required };

    // Reject non-empty hidden fields (tamper protection)
    if (!state.visible) {
      const val = payload[field.name];
      if (val !== undefined && val !== null && val !== '') {
        throw Errors.badRequest(
          `Field "${field.label}" is hidden by conditional logic and must not have a value.`,
        );
      }
      continue;
    }

    // Validate required visible fields
    if (state.required) {
      const val = payload[field.name];
      if (val === undefined || val === null || val === '') {
        errors.push(`"${field.label}" is required.`);
      }
    }
  }

  if (errors.length > 0) throw Errors.badRequest(errors.join(' '));
}
```

### 5.5 Cross-module dependency

`RequestsService` will now depend on `IFormTemplateRepository`. This is a new cross-module dependency.

**Rule:** the import goes through the interface (`IFormTemplateRepository`), not the concrete class. The concrete repository is injected in `AdapterRegistration.ts`:

```typescript
// AdapterRegistration.ts — add to RequestsService instantiation:
new RequestsService({
  requests:      requestsRepo,
  tickets:       ticketSystem,
  notifier:      notifier,
  formTemplates: formTemplateRepo,  // new
});
```

The service receives `formTemplates: IFormTemplateRepository` in its `Deps` interface.

### 5.6 Template versioning policy

**Decision: create-time-only evaluation.**

Conditions are evaluated against the template *as it exists at submission time*. If an admin later edits the template, existing requests are not re-validated; their `payload` columns remain as-stored.

Rationale:
- No new columns needed (no fieldSchema snapshot in Request row)
- Consistent with existing behaviour (template changes already silently affect request display in ViewRequestDetail)
- Re-validation of historical requests is out of scope and carries risk

**Consequence:** the detail view (`ViewRequestDetail`) renders payload fields using the current template, not the template-at-submit. This is the existing behaviour and is acceptable.

---

## 6. Frontend Changes

### 6.1 Condition engine — `frontend/src/lib/conditionEngine.ts`

Mirror of the backend engine. Exact same algorithm (topological sort → resolve visibility → resolve required). Pure TypeScript function with no React dependencies — easy to unit-test.

```typescript
export function evaluateConditions(
  fields: FormFieldDef[],
  values: Record<string, string>,
): Map<string, FieldState> { /* same algorithm as backend */ }
```

Types are duplicated in `frontend/src/api/formTemplates.ts` (no shared package). A future Phase 9 monorepo migration can extract a `packages/shared` library.

### 6.2 ViewDynamicForm changes

Three changes:

**a) Compute field states** (re-runs on every `values` change via `useMemo`):
```typescript
const fieldStates = useMemo(
  () => evaluateConditions(fields, values),
  [fields, values],
);
```

**b) Filter payload** — strip hidden fields before submission:
```typescript
const payloadValues = Object.fromEntries(
  Object.entries(values).filter(([k]) => {
    const fd = fields.find(f => f.name === k);
    const state = fieldStates.get(k);
    return fd?.type !== 'attachment' && (state?.visible ?? true);
  }),
);
```

**c) Conditional rendering** — pass effective required to DynamicField:
```typescript
{fields.map(field => {
  const state = fieldStates.get(field.name) ?? { visible: true, required: field.required };
  if (!state.visible) return null;
  return (
    <DynamicField
      key={field.name}
      field={{ ...field, required: state.required }}
      value={values[field.name] ?? ''}
      onChange={handleChange}
      onFilesChange={handleFilesChange}
      pendingFiles={pendingFiles[field.name] ?? []}
    />
  );
})}
```

**d) Validation loop** — skip hidden fields:
```typescript
for (const f of fields) {
  const state = fieldStates.get(f.name) ?? { visible: true, required: f.required };
  if (!state.visible) continue;
  if (state.required && f.type === 'richtext') { ... }
  if (state.required && f.type === 'radio' && !values[f.name]) { ... }
  if (state.required && f.type === 'checkbox' && !values[f.name]) { ... }
}
```

### 6.3 ViewCPFormBuilder changes

This is the most significant UI change. Each field card gains a collapsible **Conditions** panel.

**Extended FieldDraft:**
```typescript
interface ConditionClauseDraft {
  fieldName: string;
  operator:  string;
  value:     string;
}

interface ConditionalRuleDraft {
  when:         ConditionClauseDraft[];
  logic:        'AND' | 'OR';
  visibility?:  'show' | 'hide';
  requirement?: 'require' | 'optional';
}

interface FieldDraft {
  // existing fields ...
  defaultVisible: boolean;           // new
  conditions:     ConditionalRuleDraft[]; // new, default []
}
```

**Condition editor UX (per field card):**

```
[▼ Conditions]

  [+ Add rule]

  Rule 1:
    When  [Field dropdown ▼]  [Operator ▼]  [Value input]   [× remove clause]
          [+ AND clause] [OR]
    Then  Visibility: [show ▼]    Required: [— ▼]
    [× remove rule]

  Default visibility: ● Always visible  ○ Hidden until revealed
```

**Operator options per trigger field type:**
| Type | Available operators |
|------|---------------------|
| text, email, number | eq, neq, empty, notEmpty |
| select, radio | eq, neq, empty, notEmpty |
| checkbox | contains, notContains, empty, notEmpty |
| date | eq, neq, empty, notEmpty |

**Value input:** shown for eq/neq/contains/notContains. For select/radio trigger fields, renders a dropdown of the trigger field's options.

**buildFieldSchema update** — serialise new properties:
```typescript
conditions: f.conditions.length > 0 ? f.conditions.map(r => ({
  when:         r.when.map(c => ({ fieldName: c.fieldName, operator: c.operator, value: c.value })),
  logic:        r.logic,
  ...(r.visibility  ? { visibility:  r.visibility  } : {}),
  ...(r.requirement ? { requirement: r.requirement } : {}),
})) : undefined,
defaultVisible: f.defaultVisible ? undefined : false, // omit true (default)
```

---

## 7. API Changes

No new endpoints. The existing endpoints already carry `fieldSchema` end-to-end:

| Endpoint | Change |
|----------|--------|
| `POST /form-templates` | Zod validator now accepts `conditions` + `defaultVisible` |
| `PATCH /form-templates/:id` | Same |
| `GET /projects/:id/forms` | No change — returns full `fieldSchema` already |
| `POST /requests` | Schema adds `templateId: uuid (optional)` as top-level field |

---

## 8. Validation Strategy

### 8.1 Template save time (static validation)
- Field names unique ✓ (existing)
- `conditions[*].when[*].fieldName` references an existing field in the same template
- No self-references
- No circular dependencies (DFS cycle detection)
- Rules have at least one of `visibility` or `requirement`

### 8.2 Request submission time (dynamic validation)
1. Load `FormTemplate` by `cmd.templateId` (if present)
2. Run `evaluateConditions(tpl.fieldSchema, cmd.payload)`
3. For every field where `state.required && state.visible`: enforce non-empty value
4. For every field where `!state.visible`: reject non-empty value (tamper protection)
5. Errors → `400 Bad Request` with a descriptive message

### 8.3 Frontend (UX only)
- Mirrors backend engine; runs on every form value change
- Skips hidden fields in payload construction and validation
- Never the authoritative source

---

## 9. Security Considerations

| Threat | Mitigation |
|--------|------------|
| Tampered payload with values in hidden fields | Server strips / rejects hidden-field values (§ 5.4) |
| Bypassed frontend validation | Server re-evaluates conditions against submitted payload |
| Condition referencing non-existent field | Rejected at template save (§ 5.1) |
| Circular dependency creating infinite loop | Rejected at template save (§ 5.1); topoSort assumes acyclic |
| Admin writes javascript: value in condition value | Condition values are compared as strings, never rendered or executed |
| Template edited after requests submitted | No re-validation risk — conditions only run at creation time |
| Cross-tenant template access | `formTemplates.findById(id, clientId)` enforces tenant scope |

---

## 10. Implementation Roadmap

### Phase 1 — Types + Backend Validation (≈ 2 days)
- [ ] Add `ConditionClause`, `ConditionalRule` to `FormTemplate.ts`
- [ ] Extend `FormFieldDefSchema` in `FormTemplateValidators.ts` with condition schemas
- [ ] Add cross-field validation: reference check, self-reference check, cycle detection
- [ ] Add `templateId` to `CreateRequestSchema` (fix dual-source-of-truth bug)
- [ ] Update `ViewDynamicForm.tsx` to pass `templateId` as top-level, not in `payload`
- [ ] Unit-test validators (valid template, unknown fieldName ref, self-ref, cycle)

### Phase 2 — Frontend Engine (≈ 1 day)
- [ ] Create `frontend/src/lib/conditionEngine.ts`
- [ ] Add mirrored types to `frontend/src/api/formTemplates.ts`
- [ ] Unit-test engine: show/hide, require/optional, cascade, AND/OR, checkbox contains

### Phase 3 — ViewDynamicForm Integration (≈ 1 day)
- [ ] Add `evaluateConditions` call via `useMemo`
- [ ] Conditional rendering of `DynamicField`
- [ ] Payload stripping for hidden fields
- [ ] Validation loop respecting field states
- [ ] End-to-end manual test: 2-level nested condition, checkbox trigger, required override

### Phase 4 — Server-side Condition Validation (≈ 1 day)
- [ ] Add `IFormTemplateRepository` to `RequestsService` deps
- [ ] Implement `validatePayloadWithConditions` using backend `conditionEngine.ts`
- [ ] Wire `formTemplates` dep in `AdapterRegistration.ts`
- [ ] Unit-test service: hidden required field ignored, hidden field with value rejected, visible required field enforced

### Phase 5 — Admin Form Builder UI (≈ 3 days)
- [ ] Extend `FieldDraft` with `defaultVisible` and `conditions`
- [ ] Build `ConditionRuleEditor` sub-component (clause list, field picker, operator, value)
- [ ] Integrate into field card in `ViewCPFormBuilder`
- [ ] Show operator options filtered by trigger field type
- [ ] Show value dropdown for select/radio trigger fields
- [ ] Update `templateToFieldDrafts` and `buildFieldSchema` for round-trip fidelity
- [ ] Test: create template with 3-level nested condition; verify portal renders correctly

### Phase 6 — Polish + Edge Cases (≈ 1 day)
- [ ] Visual indicator on condition-collapsed field cards ("2 conditions")
- [ ] Warn in builder if a field with conditions is deleted (its dependents become broken)
- [ ] Clear hidden-field values when a parent field is toggled (UX, not correctness)
- [ ] Update session log + CLAUDE.md

**Total estimate: 9–10 working days**

---

## 11. Dependencies and Risks

| Item | Risk | Mitigation |
|------|------|------------|
| sortOrder used for evaluation order | High — display order ≠ dependency order | Use topological sort (designed in § 5.2) |
| Template edited while users filling forms | Low — race condition | Conditions evaluated against template at submit time; last write wins |
| Nested conditions >4 levels deep | Low — edge case | Engine is recursive; stack depth bounded by max 50 fields |
| Mobile/Safari CSS for condition editor | Medium | Condition editor is admin-only; test on desktop Chrome/Edge first |
| Phase 9 migration to SQL Server | None — design is portable | `fieldSchema` is `String @db.Text`; no new columns |

---

## 12. Out of Scope

- Numeric/date range operators (e.g., `greaterThan`, `before`) — operator set is extensible; add when a use case arises
- Real-time collaboration (two users editing same template simultaneously)
- Condition import/export between templates
- AI-assisted condition suggestion
- Version history for templates

---

## Appendix A — Example: Full JSON representation

A template with "Have you worked with this vendor before?" logic:

```json
[
  {
    "name": "worked_with_vendor",
    "label": "Have you worked with this vendor before?",
    "type": "radio",
    "required": true,
    "options": ["Yes", "No"],
    "sortOrder": 0
  },
  {
    "name": "vendor_name",
    "label": "Vendor Name",
    "type": "text",
    "required": false,
    "sortOrder": 1,
    "defaultVisible": false,
    "conditions": [
      {
        "when": [{ "fieldName": "worked_with_vendor", "operator": "eq", "value": "Yes" }],
        "visibility": "show",
        "requirement": "require"
      }
    ]
  },
  {
    "name": "contract_number",
    "label": "Previous Contract Number",
    "type": "text",
    "required": false,
    "sortOrder": 2,
    "defaultVisible": false,
    "conditions": [
      {
        "when": [{ "fieldName": "worked_with_vendor", "operator": "eq", "value": "Yes" }],
        "visibility": "show"
      }
    ]
  }
]
```

## Appendix B — Example: Multiple conditions (AND)

Show "Compliance Fields Section" only when Country = "United States" AND Request Type = "Hardware":

```json
{
  "name": "compliance_note",
  "label": "US Hardware Compliance Notice",
  "type": "richtext",
  "required": false,
  "sortOrder": 10,
  "defaultVisible": false,
  "conditions": [
    {
      "when": [
        { "fieldName": "country",      "operator": "eq", "value": "United States" },
        { "fieldName": "request_type", "operator": "eq", "value": "Hardware" }
      ],
      "logic": "AND",
      "visibility": "show"
    }
  ]
}
```
