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

export interface FormFieldDef {
  name:         string;        // stable field ID — payload key + ADO field name
  label:        string;
  type:         FormFieldType;
  required:     boolean;
  placeholder?: string;
  helpText?:    string;        // gray hint text shown below the input
  options?:     string[];      // for select / radio / checkbox
  sortOrder:    number;
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

export const formTemplatesApi = {
  listByProject(projectId: string) {
    return api.get<{ data: FormTemplate[]; count: number }>(`/projects/${projectId}/forms`);
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
};
