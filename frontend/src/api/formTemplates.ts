import { api } from './client';

export interface FormFieldDef {
  name:         string;
  label:        string;
  type:         'text' | 'textarea' | 'select' | 'date' | 'email' | 'number';
  required:     boolean;
  placeholder?: string;
  options?:     string[];
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
