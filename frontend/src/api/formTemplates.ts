import { api } from './client';

/**
 * Field types supported by the dynamic form renderer.
 * `name` on each FormFieldDef is the stable field ID used in the request payload
 * and in Azure DevOps / Power Automate integrations.
 */
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'    // Tiptap rich-text editor; value is an HTML string
  | 'select'
  | 'radio'
  | 'checkbox'    // multi-select; value stored as comma-separated string
  | 'date'
  | 'email'
  | 'number'
  | 'attachment'; // files collected separately and uploaded after request creation

export type ConditionOperator =
  | 'eq' | 'neq' | 'contains' | 'notContains' | 'empty' | 'notEmpty';

export interface ConditionClause {
  fieldName: string;
  operator:  ConditionOperator;
  value:     string;
}

export interface ConditionalRule {
  when:         ConditionClause[];
  logic?:       'AND' | 'OR';
  visibility?:  'show' | 'hide';
  requirement?: 'require' | 'optional';
}

export interface FormFieldDef {
  name:            string;        // stable field ID — payload key + ADO field name
  label:           string;
  type:            FormFieldType;
  required:        boolean;
  placeholder?:    string;
  helpText?:       string;        // gray hint text shown below the input
  options?:        string[];      // for select / radio / checkbox
  sortOrder:       number;
  defaultVisible?: boolean;       // true if omitted
  conditions?:     ConditionalRule[];
}

export interface FormTemplate {
  id:          string;
  clientId:    string;
  name:        string;
  slug:        string;
  description: string | null;
  isStandard:  boolean;
  fieldSchema: FormFieldDef[];
}

export interface ProjectFormConfigEntry {
  id:        string;
  projectId: string;
  templateId: string;
  isEnabled: boolean;
  sortOrder: number;
  template:  FormTemplate;
}

export const formTemplatesApi = {
  listByProject(projectId: string) {
    return api.get<{ data: FormTemplate[]; count: number }>(`/projects/${projectId}/forms`);
  },
  listProjectConfigs(projectId: string) {
    return api.get<{ data: ProjectFormConfigEntry[]; count: number }>(`/projects/${projectId}/forms/configs`);
  },
  listAll() {
    return api.get<{ data: FormTemplate[]; count: number }>('/form-templates');
  },
  getById(id: string) {
    return api.get<FormTemplate>(`/form-templates/${id}`);
  },
  create(payload: {
    name: string;
    slug: string;
    description?: string;
    fieldSchema: FormFieldDef[];
  }) {
    return api.post<FormTemplate>('/form-templates', payload);
  },
  update(id: string, patch: { name?: string; description?: string; fieldSchema?: FormFieldDef[] }) {
    return api.patch<FormTemplate>(`/form-templates/${id}`, patch);
  },
  remove(id: string) {
    return api.delete<void>(`/form-templates/${id}`);
  },
  removeFromProject(projectId: string, templateId: string) {
    return api.delete<void>(`/projects/${projectId}/forms/${templateId}`);
  },
};
