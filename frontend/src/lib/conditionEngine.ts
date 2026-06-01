import type { FormFieldDef, ConditionClause, ConditionOperator } from '../api/formTemplates';

export interface FieldState {
  visible:  boolean;
  required: boolean;
}

/**
 * Evaluate all conditional rules for a field set against the current form values.
 * Mirror of the backend conditionEngine — frontend runs this for real-time UX;
 * the backend is the authoritative source of truth.
 *
 * Uses topological sort so triggers are resolved before their dependents,
 * regardless of sortOrder (display order, not execution order).
 */
export function evaluateConditions(
  fields: FormFieldDef[],
  values: Record<string, string>,
): Map<string, FieldState> {
  const sorted = topoSort(fields);
  const result = new Map<string, FieldState>();

  for (const field of sorted) {
    const visible  = resolveVisibility(field, values, result);
    const required = resolveRequired(field, values, result, visible);
    result.set(field.name, { visible, required });
  }

  return result;
}

function resolveVisibility(
  field:    FormFieldDef,
  values:   Record<string, string>,
  resolved: Map<string, FieldState>,
): boolean {
  let visible = field.defaultVisible ?? true;
  for (const rule of field.conditions ?? []) {
    if (rule.visibility === undefined) continue;
    if (clausesMatch(rule.when, rule.logic ?? 'AND', values, resolved)) {
      visible = rule.visibility === 'show';
    }
  }
  return visible;
}

function resolveRequired(
  field:     FormFieldDef,
  values:    Record<string, string>,
  resolved:  Map<string, FieldState>,
  isVisible: boolean,
): boolean {
  if (!isVisible) return false;
  let required = field.required;
  for (const rule of field.conditions ?? []) {
    if (rule.requirement === undefined) continue;
    if (clausesMatch(rule.when, rule.logic ?? 'AND', values, resolved)) {
      required = rule.requirement === 'require';
    }
  }
  return required;
}

function clausesMatch(
  clauses:  ConditionClause[],
  logic:    'AND' | 'OR',
  values:   Record<string, string>,
  resolved: Map<string, FieldState>,
): boolean {
  const results = clauses.map(c => {
    const triggerVisible = resolved.get(c.fieldName)?.visible ?? true;
    const raw = triggerVisible ? (values[c.fieldName] ?? '') : '';
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

  const order:  FormFieldDef[] = [];
  const visited = new Set<string>();

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
