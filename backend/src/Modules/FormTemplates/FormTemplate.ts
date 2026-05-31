/**
 * Form templates — reusable form definitions stored in the DB.
 * `fieldSchema` is a JSON string (portable to SQL Server nvarchar(max)) describing
 * the field set. The frontend renders any template dynamically by reading this schema.
 */

export type FormFieldType = 'text' | 'textarea' | 'select' | 'date' | 'email' | 'number';

export interface FormFieldDef {
  name:        string;            // payload key (camelCase)
  label:       string;            // visible label
  type:        FormFieldType;
  required:    boolean;
  placeholder?: string;
  options?:    string[];          // for type='select' only
  sortOrder:   number;             // display order
}

export interface FormTemplate {
  id:          string;
  clientId:    string;
  name:        string;
  slug:        string;
  description: string | null;
  isStandard:  boolean;            // true = seeded system template, cannot be deleted
  fieldSchema: FormFieldDef[];     // parsed (repository writes/reads the JSON string)
  createdAt:   Date;
  updatedAt:   Date;
}

export interface CreateFormTemplateCmd {
  clientId:    string;
  name:        string;
  slug:        string;
  description?: string | null;
  fieldSchema: FormFieldDef[];
}

export interface UpdateFormTemplatePatch {
  name?:        string;
  description?: string | null;
  fieldSchema?: FormFieldDef[];
}

/** Per-project enabling. SuperAdmin/Admin toggles isEnabled per project. */
export interface ProjectFormConfig {
  id:         string;
  projectId:  string;
  templateId: string;
  isEnabled:  boolean;
  sortOrder:  number;
  createdAt:  Date;
}
