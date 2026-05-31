import type { FormTemplate, CreateFormTemplateCmd, UpdateFormTemplatePatch } from './FormTemplate.js';
import type { IFormTemplateRepository } from './FormTemplateRepository.js';
import { FieldSchemaArraySchema } from './FormTemplateValidators.js';
import { Errors } from '../../Shared/errors.js';

interface Deps {
  templates: IFormTemplateRepository;
}

export class FormTemplateService {
  constructor(private readonly deps: Deps) {}

  async create(cmd: CreateFormTemplateCmd): Promise<FormTemplate> {
    // Re-validate fieldSchema even when called internally (catches programmer error)
    const parsed = FieldSchemaArraySchema.safeParse(cmd.fieldSchema);
    if (!parsed.success) throw Errors.badRequest(`Invalid fieldSchema: ${parsed.error.message}`);

    const dup = await this.deps.templates.findBySlug(cmd.clientId, cmd.slug);
    if (dup) throw Errors.conflict(`A template with slug "${cmd.slug}" already exists in this client`);

    return this.deps.templates.create({ ...cmd, isStandard: false });
  }

  async getById(id: string): Promise<FormTemplate> {
    const t = await this.deps.templates.findById(id);
    if (!t) throw Errors.notFound(`Template ${id} not found`);
    return t;
  }

  async list(clientId?: string): Promise<FormTemplate[]> {
    return this.deps.templates.list(clientId);
  }

  async update(id: string, patch: UpdateFormTemplatePatch): Promise<FormTemplate> {
    await this.getById(id);
    if (patch.fieldSchema) {
      const parsed = FieldSchemaArraySchema.safeParse(patch.fieldSchema);
      if (!parsed.success) throw Errors.badRequest(`Invalid fieldSchema: ${parsed.error.message}`);
    }
    return this.deps.templates.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.deps.templates.delete(id);
  }

  // Project configuration
  async listProjectConfigs(projectId: string) {
    return this.deps.templates.listProjectConfigs(projectId);
  }

  async setProjectConfigs(projectId: string, configs: Array<{ templateId: string; isEnabled: boolean; sortOrder?: number }>) {
    // Verify each template exists before persisting
    for (const c of configs) {
      const t = await this.deps.templates.findById(c.templateId);
      if (!t) throw Errors.badRequest(`Template ${c.templateId} does not exist`);
    }
    await this.deps.templates.setProjectConfigs(projectId, configs);
  }

  async listEnabledForProject(projectId: string): Promise<FormTemplate[]> {
    return this.deps.templates.listEnabledTemplates(projectId);
  }
}
