import { describe, it, expect } from 'vitest';
import { evaluateConditions }   from './conditionEngine.js';
import type { FormFieldDef }    from './FormTemplate.js';

function field(override: Partial<FormFieldDef> & { name: string; label: string }): FormFieldDef {
  return {
    type:      'text',
    required:  false,
    sortOrder: 0,
    ...override,
  };
}

describe('evaluateConditions', () => {
  describe('no conditions', () => {
    it('all fields visible and required as defined', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'a', label: 'A', required: true }),
        field({ name: 'b', label: 'B', required: false }),
      ];
      const result = evaluateConditions(schema, {});
      expect(result.get('a')).toEqual({ visible: true, required: true });
      expect(result.get('b')).toEqual({ visible: true, required: false });
    });
  });

  describe('show/hide visibility', () => {
    it('shows a hidden-by-default field when the trigger eq matches', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'worked', label: 'Worked?', type: 'radio', required: true, options: ['Yes','No'] }),
        field({
          name: 'vendor', label: 'Vendor Name', defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'worked', operator: 'eq', value: 'Yes' }], visibility: 'show' }],
        }),
      ];
      expect(evaluateConditions(schema, { worked: 'Yes' }).get('vendor')?.visible).toBe(true);
      expect(evaluateConditions(schema, { worked: 'No'  }).get('vendor')?.visible).toBe(false);
      expect(evaluateConditions(schema, {}).get('vendor')?.visible).toBe(false);
    });

    it('hides a visible-by-default field when the trigger eq matches', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'type', label: 'Type', type: 'select', required: true, options: ['internal','external'] }),
        field({
          name: 'ext', label: 'External Ref', defaultVisible: true,
          conditions: [{ when: [{ fieldName: 'type', operator: 'eq', value: 'internal' }], visibility: 'hide' }],
        }),
      ];
      expect(evaluateConditions(schema, { type: 'internal' }).get('ext')?.visible).toBe(false);
      expect(evaluateConditions(schema, { type: 'external' }).get('ext')?.visible).toBe(true);
    });

    it('neq operator', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'country', label: 'Country' }),
        field({
          name: 'state', label: 'State', defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'country', operator: 'neq', value: 'UK' }], visibility: 'show' }],
        }),
      ];
      expect(evaluateConditions(schema, { country: 'US' }).get('state')?.visible).toBe(true);
      expect(evaluateConditions(schema, { country: 'UK' }).get('state')?.visible).toBe(false);
    });

    it('empty / notEmpty operators', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'notes', label: 'Notes' }),
        field({
          name: 'reason', label: 'Reason', defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'notes', operator: 'notEmpty', value: '' }], visibility: 'show' }],
        }),
      ];
      expect(evaluateConditions(schema, { notes: 'something' }).get('reason')?.visible).toBe(true);
      expect(evaluateConditions(schema, { notes: '' }).get('reason')?.visible).toBe(false);
      expect(evaluateConditions(schema, {}).get('reason')?.visible).toBe(false);
    });

    it('contains / notContains for checkbox values', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'services', label: 'Services', type: 'checkbox', required: false, options: ['A','B','C'] }),
        field({
          name: 'addon', label: 'Add-on', defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'services', operator: 'contains', value: 'A' }], visibility: 'show' }],
        }),
      ];
      expect(evaluateConditions(schema, { services: 'A, B' }).get('addon')?.visible).toBe(true);
      expect(evaluateConditions(schema, { services: 'B, C' }).get('addon')?.visible).toBe(false);
    });
  });

  describe('require/optional', () => {
    it('makes an optional field required when the condition fires', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'type', label: 'Type', type: 'radio', options: ['hardware','software'] }),
        field({
          name: 'serial', label: 'Serial #', required: false,
          conditions: [{ when: [{ fieldName: 'type', operator: 'eq', value: 'hardware' }], requirement: 'require' }],
        }),
      ];
      expect(evaluateConditions(schema, { type: 'hardware' }).get('serial')?.required).toBe(true);
      expect(evaluateConditions(schema, { type: 'software' }).get('serial')?.required).toBe(false);
    });

    it('hidden fields are never required regardless of conditions', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'trigger', label: 'Trigger' }),
        field({
          name: 'hidden', label: 'Hidden', required: true, defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'trigger', operator: 'eq', value: 'x' }], requirement: 'require' }],
        }),
      ];
      // Even if trigger = 'x', the field is hidden so required must be false
      expect(evaluateConditions(schema, { trigger: 'x' }).get('hidden')).toEqual({ visible: false, required: false });
    });
  });

  describe('AND / OR logic', () => {
    it('AND — both clauses must match', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'country', label: 'Country' }),
        field({ name: 'rtype',   label: 'Type' }),
        field({
          name: 'compliance', label: 'Compliance', defaultVisible: false,
          conditions: [{
            when: [
              { fieldName: 'country', operator: 'eq', value: 'United States' },
              { fieldName: 'rtype',   operator: 'eq', value: 'Hardware' },
            ],
            logic: 'AND',
            visibility: 'show',
          }],
        }),
      ];
      expect(evaluateConditions(schema, { country: 'United States', rtype: 'Hardware' }).get('compliance')?.visible).toBe(true);
      expect(evaluateConditions(schema, { country: 'United States', rtype: 'Software' }).get('compliance')?.visible).toBe(false);
      expect(evaluateConditions(schema, { country: 'UK',            rtype: 'Hardware' }).get('compliance')?.visible).toBe(false);
    });

    it('OR — either clause suffices', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'role', label: 'Role' }),
        field({ name: 'dept', label: 'Dept' }),
        field({
          name: 'special', label: 'Special', defaultVisible: false,
          conditions: [{
            when: [
              { fieldName: 'role', operator: 'eq', value: 'manager' },
              { fieldName: 'dept', operator: 'eq', value: 'exec' },
            ],
            logic: 'OR',
            visibility: 'show',
          }],
        }),
      ];
      expect(evaluateConditions(schema, { role: 'manager', dept: 'eng' }).get('special')?.visible).toBe(true);
      expect(evaluateConditions(schema, { role: 'engineer', dept: 'exec' }).get('special')?.visible).toBe(true);
      expect(evaluateConditions(schema, { role: 'engineer', dept: 'eng' }).get('special')?.visible).toBe(false);
    });
  });

  describe('cascade / nested conditions', () => {
    it('A → B → C: hiding A also hides B and C', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'a', label: 'A', type: 'radio', options: ['yes','no'] }),
        field({
          name: 'b', label: 'B', defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'a', operator: 'eq', value: 'yes' }], visibility: 'show' }],
        }),
        field({
          name: 'c', label: 'C', defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'b', operator: 'notEmpty', value: '' }], visibility: 'show' }],
        }),
      ];
      // B visible, C visible (b has value)
      const shown = evaluateConditions(schema, { a: 'yes', b: 'somevalue' });
      expect(shown.get('b')?.visible).toBe(true);
      expect(shown.get('c')?.visible).toBe(true);

      // A=no → B hidden → B treated as empty → C hidden
      const hidden = evaluateConditions(schema, { a: 'no', b: 'somevalue' });
      expect(hidden.get('b')?.visible).toBe(false);
      expect(hidden.get('c')?.visible).toBe(false);
    });

    it('evaluates correctly regardless of schema sortOrder', () => {
      // C comes before A in sortOrder, but C depends on A
      const schema: FormFieldDef[] = [
        field({
          name: 'c', label: 'C', sortOrder: 0, defaultVisible: false,
          conditions: [{ when: [{ fieldName: 'a', operator: 'eq', value: 'yes' }], visibility: 'show' }],
        }),
        field({ name: 'a', label: 'A', sortOrder: 1 }),
      ];
      expect(evaluateConditions(schema, { a: 'yes' }).get('c')?.visible).toBe(true);
      expect(evaluateConditions(schema, { a: 'no'  }).get('c')?.visible).toBe(false);
    });
  });

  describe('multiple rules per field', () => {
    it('later rules override earlier ones', () => {
      const schema: FormFieldDef[] = [
        field({ name: 'plan', label: 'Plan' }),
        field({ name: 'org',  label: 'Org' }),
        field({
          name: 'upgrade', label: 'Upgrade', defaultVisible: false,
          conditions: [
            // Rule 1: show when plan = premium
            { when: [{ fieldName: 'plan', operator: 'eq', value: 'premium' }], visibility: 'show' },
            // Rule 2: hide when org = personal (overrides rule 1)
            { when: [{ fieldName: 'org', operator: 'eq', value: 'personal' }], visibility: 'hide' },
          ],
        }),
      ];
      expect(evaluateConditions(schema, { plan: 'premium', org: 'corp'     }).get('upgrade')?.visible).toBe(true);
      expect(evaluateConditions(schema, { plan: 'premium', org: 'personal' }).get('upgrade')?.visible).toBe(false);
    });
  });
});
