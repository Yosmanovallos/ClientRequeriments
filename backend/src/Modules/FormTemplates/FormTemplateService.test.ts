import { describe, it, expect } from 'vitest';
import { FormTemplateService } from './FormTemplateService.js';
import { InMemoryFormTemplateRepository } from './FormTemplateRepository.js';
import { STANDARD_TEMPLATES, seedStandardTemplates } from './standardTemplates.js';
import type { FormFieldDef } from './FormTemplate.js';

const CLIENT_A = '00000000-0000-0000-0000-000000000001';

function makeSvc() {
  const repo = new InMemoryFormTemplateRepository();
  return { svc: new FormTemplateService({ templates: repo }), repo };
}

const sampleFields: FormFieldDef[] = [
  { name: 'title', label: 'Title', type: 'text', required: true, sortOrder: 1 },
];

describe('FormTemplateService.create', () => {
  it('creates a custom template (isStandard=false)', async () => {
    const { svc } = makeSvc();
    const t = await svc.create({
      clientId: CLIENT_A, name: 'Custom Form', slug: 'custom-form', fieldSchema: sampleFields,
    });
    expect(t.id).toBeTruthy();
    expect(t.isStandard).toBe(false);
    expect(t.fieldSchema).toEqual(sampleFields);
  });

  it('rejects duplicate slug within same client', async () => {
    const { svc } = makeSvc();
    await svc.create({ clientId: CLIENT_A, name: 'A', slug: 'shared', fieldSchema: sampleFields });
    await expect(svc.create({ clientId: CLIENT_A, name: 'A2', slug: 'shared', fieldSchema: sampleFields }))
      .rejects.toThrow(/already exists/);
  });

  it('rejects invalid fieldSchema (e.g. select without options)', async () => {
    const { svc } = makeSvc();
    await expect(svc.create({
      clientId: CLIENT_A, name: 'X', slug: 'x',
      fieldSchema: [{ name: 'bad', label: 'B', type: 'select', required: true, sortOrder: 1 }] as never,
    })).rejects.toThrow(/select-type fields must have at least one option/);
  });

  it('rejects duplicate field names in same template', async () => {
    const { svc } = makeSvc();
    await expect(svc.create({
      clientId: CLIENT_A, name: 'X', slug: 'x',
      fieldSchema: [
        { name: 'dup', label: 'A', type: 'text', required: true, sortOrder: 1 },
        { name: 'dup', label: 'B', type: 'text', required: true, sortOrder: 2 },
      ],
    })).rejects.toThrow(/unique/);
  });
});

describe('FormTemplateService.update — standard template protection', () => {
  it('allows renaming a standard template', async () => {
    const { svc, repo } = makeSvc();
    const seeded = await repo.create({
      clientId: CLIENT_A, name: 'Standard', slug: 'std',
      fieldSchema: sampleFields, isStandard: true,
    });
    const updated = await svc.update(seeded.id, { name: 'Standard (renamed)' });
    expect(updated.name).toBe('Standard (renamed)');
  });

  it('REJECTS fieldSchema edit on a standard template', async () => {
    const { svc, repo } = makeSvc();
    const seeded = await repo.create({
      clientId: CLIENT_A, name: 'Standard', slug: 'std',
      fieldSchema: sampleFields, isStandard: true,
    });
    await expect(svc.update(seeded.id, {
      fieldSchema: [{ name: 'new', label: 'New', type: 'text', required: true, sortOrder: 1 }],
    })).rejects.toThrow(/fixed fieldSchema/);
  });

  it('allows fieldSchema edit on a custom template', async () => {
    const { svc } = makeSvc();
    const custom = await svc.create({ clientId: CLIENT_A, name: 'C', slug: 'c', fieldSchema: sampleFields });
    const newFields: FormFieldDef[] = [
      { name: 'a', label: 'A', type: 'text', required: true, sortOrder: 1 },
      { name: 'b', label: 'B', type: 'date', required: false, sortOrder: 2 },
    ];
    const updated = await svc.update(custom.id, { fieldSchema: newFields });
    expect(updated.fieldSchema).toHaveLength(2);
  });
});

describe('FormTemplateService.delete', () => {
  it('rejects deleting a standard template', async () => {
    const { svc, repo } = makeSvc();
    const seeded = await repo.create({
      clientId: CLIENT_A, name: 'Standard', slug: 'std', fieldSchema: sampleFields, isStandard: true,
    });
    await expect(svc.delete(seeded.id)).rejects.toThrow(/cannot be deleted/);
  });

  it('deletes a custom template', async () => {
    const { svc } = makeSvc();
    const custom = await svc.create({ clientId: CLIENT_A, name: 'C', slug: 'c', fieldSchema: sampleFields });
    await svc.delete(custom.id);
    await expect(svc.getById(custom.id)).rejects.toThrow(/not found/);
  });
});

describe('Per-project form configuration', () => {
  it('listEnabledForProject returns only isEnabled=true, in sortOrder', async () => {
    const { svc } = makeSvc();
    const t1 = await svc.create({ clientId: CLIENT_A, name: 'T1', slug: 't1', fieldSchema: sampleFields });
    const t2 = await svc.create({ clientId: CLIENT_A, name: 'T2', slug: 't2', fieldSchema: sampleFields });
    const t3 = await svc.create({ clientId: CLIENT_A, name: 'T3', slug: 't3', fieldSchema: sampleFields });
    const projectId = '00000000-0000-0000-0000-0000000000aa';

    await svc.setProjectConfigs(projectId, [
      { templateId: t1.id, isEnabled: true,  sortOrder: 2 },
      { templateId: t2.id, isEnabled: false, sortOrder: 1 },     // disabled
      { templateId: t3.id, isEnabled: true,  sortOrder: 0 },
    ]);

    const enabled = await svc.listEnabledForProject(projectId);
    expect(enabled.map(t => t.name)).toEqual(['T3', 'T1']);     // sortOrder 0 then 2; T2 excluded
  });

  it('setProjectConfigs rejects non-existent templateIds', async () => {
    const { svc } = makeSvc();
    await expect(svc.setProjectConfigs('p-1', [
      { templateId: '11111111-1111-1111-1111-111111111111', isEnabled: true },
    ])).rejects.toThrow(/does not exist/);
  });

  it('setProjectConfigs is idempotent (re-run does not duplicate rows)', async () => {
    const { svc } = makeSvc();
    const t = await svc.create({ clientId: CLIENT_A, name: 'T', slug: 't', fieldSchema: sampleFields });
    const projectId = '00000000-0000-0000-0000-0000000000aa';

    await svc.setProjectConfigs(projectId, [{ templateId: t.id, isEnabled: true,  sortOrder: 1 }]);
    await svc.setProjectConfigs(projectId, [{ templateId: t.id, isEnabled: false, sortOrder: 5 }]);

    const configs = await svc.listProjectConfigs(projectId);
    expect(configs).toHaveLength(1);
    expect(configs[0]!.isEnabled).toBe(false);
    expect(configs[0]!.sortOrder).toBe(5);
  });
});

describe('Standard templates seed', () => {
  it('seeds all 5 standard templates as isStandard=true', async () => {
    const { repo } = makeSvc();
    const result = await seedStandardTemplates(CLIENT_A, repo);
    expect(result.created).toBe(5);
    expect(result.skipped).toBe(0);

    const all = await repo.list(CLIENT_A);
    expect(all).toHaveLength(5);
    expect(all.every(t => t.isStandard === true)).toBe(true);
    expect(all.map(t => t.slug).sort()).toEqual(['fix-issue', 'new-feature', 'new-page', 'new-report', 'view-request']);
  });

  it('re-seeding is idempotent (skipped count = 5)', async () => {
    const { repo } = makeSvc();
    await seedStandardTemplates(CLIENT_A, repo);
    const second = await seedStandardTemplates(CLIENT_A, repo);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(5);
  });

  it('each standard template has a non-empty fieldSchema', () => {
    for (const tpl of STANDARD_TEMPLATES) {
      expect(tpl.fieldSchema.length).toBeGreaterThan(0);
      // Every field has the required keys
      for (const f of tpl.fieldSchema) {
        expect(f.name).toBeTruthy();
        expect(f.label).toBeTruthy();
        expect(typeof f.required).toBe('boolean');
        expect(typeof f.sortOrder).toBe('number');
      }
    }
  });
});
