import type { FormFieldDef, ConditionClause, ConditionOperator } from './FormTemplate.js';

export interface FieldState {
  visible:  boolean;
  required: boolean;
}

/**
 * Evaluate all conditional rules for a field set against a payload.
 *
 * Uses topological sort so triggers are always resolved before their dependents,
 * regardless of sortOrder (which is a display property, not an execution order).
 * Guarantees: no infinite loops — cycle-free is enforced at template-save time.
 */
export function evaluateConditions(
  schema:  FormFieldDef[],
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
  if (!isVisible) return false; // hidden fields are never required
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
  clauses:  ConditionClause[],
  logic:    'AND' | 'OR',
  payload:  Record<string, unknown>,
  resolved: Map<string, FieldState>,
): boolean {
  const results = clauses.map(c => {
    // If the trigger field is itself hidden, treat its value as empty (cascade)
    const triggerVisible = resolved.get(c.fieldName)?.visible ?? true;
    const raw = triggerVisible ? String(payload[c.fieldName] ?? '') : '';
    return evalClause(c.operator, raw, c.value);
  });
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function evalClause(op: ConditionOperator, val: string, target: string): boolean {
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
 * Fields with no dependencies come first; dependents come after all their triggers.
 * Assumes the graph is acyclic (guaranteed by template-save validation).
 */
function topoSort(schema: FormFieldDef[]): FormFieldDef[] {
  const byName = new Map(schema.map(f => [f.name, f]));
  const deps   = new Map<string, string[]>();
  for (const f of schema) {
    const d: string[] = [];
    for (const rule of f.conditions ?? []) {
      for (const c of rule.when) d.push(c.fieldName);
    }
    deps.set(f.name, d);
  }

  const order:   FormFieldDef[] = [];
  const visited  = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    for (const dep of deps.get(name) ?? []) visit(dep);
    visited.add(name);
    const field = byName.get(name);
    if (field) order.push(field);
  }

  for (const f of schema) visit(f.name);
  return order;
}
