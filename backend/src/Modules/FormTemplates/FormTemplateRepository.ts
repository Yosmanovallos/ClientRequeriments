import type { PrismaClient } from '@prisma/client';
import type { FormTemplate, CreateFormTemplateCmd, UpdateFormTemplatePatch, ProjectFormConfig, FormFieldDef } from './FormTemplate.js';

export interface IFormTemplateRepository {
  create(cmd: CreateFormTemplateCmd & { isStandard?: boolean }): Promise<FormTemplate>;
  findById(id: string): Promise<FormTemplate | null>;
  findBySlug(clientId: string, slug: string): Promise<FormTemplate | null>;
  list(clientId?: string): Promise<FormTemplate[]>;
  update(id: string, patch: UpdateFormTemplatePatch): Promise<FormTemplate>;
  delete(id: string): Promise<void>;

  // Per-project configuration
  listProjectConfigs(projectId: string): Promise<ProjectFormConfig[]>;
  /** Replace the project's full configuration in one transaction (upsert per entry). */
  setProjectConfigs(projectId: string, configs: Array<{ templateId: string; isEnabled: boolean; sortOrder?: number }>): Promise<void>;
  /** List enabled templates for a project, in sortOrder. */
  listEnabledTemplates(projectId: string): Promise<FormTemplate[]>;
}

// ── InMemory ────────────────────────────────────────────────────────────────
export class InMemoryFormTemplateRepository implements IFormTemplateRepository {
  private readonly templates = new Map<string, FormTemplate>();
  private readonly configs   = new Map<string, ProjectFormConfig>();

  async create(cmd: CreateFormTemplateCmd & { isStandard?: boolean }): Promise<FormTemplate> {
    const now = new Date();
    const t: FormTemplate = {
      id:          crypto.randomUUID(),
      clientId:    cmd.clientId,
      name:        cmd.name,
      slug:        cmd.slug,
      description: cmd.description ?? null,
      isStandard:  cmd.isStandard ?? false,
      fieldSchema: cmd.fieldSchema,
      createdAt:   now,
      updatedAt:   now,
    };
    this.templates.set(t.id, t);
    return t;
  }

  async findById(id: string): Promise<FormTemplate | null> {
    return this.templates.get(id) ?? null;
  }

  async findBySlug(clientId: string, slug: string): Promise<FormTemplate | null> {
    for (const t of this.templates.values()) {
      if (t.clientId === clientId && t.slug === slug) return t;
    }
    return null;
  }

  async list(clientId?: string): Promise<FormTemplate[]> {
    return [...this.templates.values()]
      .filter(t => !clientId || t.clientId === clientId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async update(id: string, patch: UpdateFormTemplatePatch): Promise<FormTemplate> {
    const t = this.templates.get(id);
    if (!t) throw new Error('Template not found');
    Object.assign(t, patch, { updatedAt: new Date() });
    return t;
  }

  async delete(id: string): Promise<void> {
    this.templates.delete(id);
    // Cascade: remove configs that referenced this template
    for (const [cid, c] of this.configs) {
      if (c.templateId === id) this.configs.delete(cid);
    }
  }

  async listProjectConfigs(projectId: string): Promise<ProjectFormConfig[]> {
    return [...this.configs.values()]
      .filter(c => c.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async setProjectConfigs(projectId: string, configs: Array<{ templateId: string; isEnabled: boolean; sortOrder?: number }>): Promise<void> {
    for (const c of configs) {
      const existing = [...this.configs.values()].find(x => x.projectId === projectId && x.templateId === c.templateId);
      if (existing) {
        existing.isEnabled = c.isEnabled;
        if (c.sortOrder != null) existing.sortOrder = c.sortOrder;
      } else {
        const id = crypto.randomUUID();
        this.configs.set(id, {
          id, projectId, templateId: c.templateId,
          isEnabled: c.isEnabled,
          sortOrder: c.sortOrder ?? 0,
          createdAt: new Date(),
        });
      }
    }
  }

  async listEnabledTemplates(projectId: string): Promise<FormTemplate[]> {
    const enabledIds = [...this.configs.values()]
      .filter(c => c.projectId === projectId && c.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(c => c.templateId);

    return enabledIds
      .map(id => this.templates.get(id))
      .filter((t): t is FormTemplate => t !== undefined);
  }
}

// ── Prisma ──────────────────────────────────────────────────────────────────
export class PrismaFormTemplateRepository implements IFormTemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(cmd: CreateFormTemplateCmd & { isStandard?: boolean }): Promise<FormTemplate> {
    const row = await this.prisma.formTemplate.create({
      data: {
        clientId:    cmd.clientId,
        name:        cmd.name,
        slug:        cmd.slug,
        description: cmd.description ?? null,
        isStandard:  cmd.isStandard ?? false,
        fieldSchema: JSON.stringify(cmd.fieldSchema),
      },
    });
    return this.toDomain(row);
  }

  async findById(id: string): Promise<FormTemplate | null> {
    const row = await this.prisma.formTemplate.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(clientId: string, slug: string): Promise<FormTemplate | null> {
    const row = await this.prisma.formTemplate.findUnique({
      where: { clientId_slug: { clientId, slug } },
    });
    return row ? this.toDomain(row) : null;
  }

  async list(clientId?: string): Promise<FormTemplate[]> {
    const rows = await this.prisma.formTemplate.findMany({
      where:   clientId ? { clientId } : undefined,
      orderBy: { name: 'asc' },
    });
    return rows.map(this.toDomain);
  }

  async update(id: string, patch: UpdateFormTemplatePatch): Promise<FormTemplate> {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined)        data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.fieldSchema !== undefined) data.fieldSchema = JSON.stringify(patch.fieldSchema);
    const row = await this.prisma.formTemplate.update({ where: { id }, data });
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.projectFormConfig.deleteMany({ where: { templateId: id } });
      await tx.formTemplate.delete({ where: { id } });
    });
  }

  async listProjectConfigs(projectId: string): Promise<ProjectFormConfig[]> {
    const rows = await this.prisma.projectFormConfig.findMany({
      where: { projectId }, orderBy: { sortOrder: 'asc' },
    });
    return rows.map(r => ({
      id: r.id, projectId: r.projectId, templateId: r.templateId,
      isEnabled: r.isEnabled, sortOrder: r.sortOrder, createdAt: r.createdAt,
    }));
  }

  async setProjectConfigs(projectId: string, configs: Array<{ templateId: string; isEnabled: boolean; sortOrder?: number }>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const c of configs) {
        await tx.projectFormConfig.upsert({
          where:  { projectId_templateId: { projectId, templateId: c.templateId } },
          update: { isEnabled: c.isEnabled, sortOrder: c.sortOrder ?? 0 },
          create: { projectId, templateId: c.templateId, isEnabled: c.isEnabled, sortOrder: c.sortOrder ?? 0 },
        });
      }
    });
  }

  async listEnabledTemplates(projectId: string): Promise<FormTemplate[]> {
    const rows = await this.prisma.projectFormConfig.findMany({
      where:   { projectId, isEnabled: true },
      orderBy: { sortOrder: 'asc' },
      include: { template: true },
    });
    return rows.map(r => this.toDomain(r.template));
  }

  private toDomain = (r: {
    id: string; clientId: string; name: string; slug: string;
    description: string | null; isStandard: boolean; fieldSchema: string;
    createdAt: Date; updatedAt: Date;
  }): FormTemplate => {
    let parsed: FormFieldDef[] = [];
    try { parsed = JSON.parse(r.fieldSchema) as FormFieldDef[]; } catch { /* corrupted JSON → empty schema */ }
    return {
      id:          r.id,
      clientId:    r.clientId,
      name:        r.name,
      slug:        r.slug,
      description: r.description,
      isStandard:  r.isStandard,
      fieldSchema: parsed,
      createdAt:   r.createdAt,
      updatedAt:   r.updatedAt,
    };
  };
}
