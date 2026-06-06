/**
 * Form templates — reusable form definitions stored in the DB.
 * `fieldSchema` is a JSON string (portable to SQL Server nvarchar(max)) describing
 * the field set. The frontend renders any template dynamically by reading this schema.
 *
 * Field IDs: every field has a stable `name` property that serves as its unique ID.
 * This is the key used in the request payload and in Azure DevOps / Power Automate
 * field mappings. Keep `name` values stable across template versions.
 */

export type FormFieldType =
  | 'text'        // single-line text input
  | 'textarea'    // plain multi-line text (legacy; prefer richtext for new templates)
  | 'richtext'    // rich text editor with toolbar (output: HTML string)
  | 'select'      // single-choice dropdown
  | 'radio'       // single-choice radio group
  | 'checkbox'    // multi-choice checkboxes (value stored as comma-separated string)
  | 'date'        // date picker
  | 'email'       // email input
  | 'number'      // numeric input
  | 'attachment'; // file drag-and-drop (handled separately; not stored in payload)

export type ConditionOperator =
  | 'eq'           // exact match
  | 'neq'          // not equal
  | 'contains'     // value is one of comma-separated selections (checkbox / multi)
  | 'notContains'  // value is NOT in selections
  | 'empty'        // field has no value
  | 'notEmpty';    // field has any value

export interface ConditionClause {
  fieldName: string;
  operator:  ConditionOperator;
  value:     string; // ignored for 'empty' / 'notEmpty'
}

export interface ConditionalRule {
  when:         ConditionClause[];         // 1–10 clauses
  logic?:       'AND' | 'OR';             // default 'AND'
  visibility?:  'show' | 'hide';          // omit → no effect on visibility
  requirement?: 'require' | 'optional';   // omit → no effect on required state
}

export interface FormFieldDef {
  /** Stable field identifier — used as the payload key and ADO/Power Automate field name. */
  name:            string;
  /** Human-readable label shown above the field. */
  label:           string;
  type:            FormFieldType;
  required:        boolean;
  placeholder?:    string;
  /** Gray helper text shown below the input (matches service-desk hint lines). */
  helpText?:       string;
  /** Allowed values for select / radio / checkbox field types. */
  options?:        string[];
  /** Controls rendering order on the form. */
  sortOrder:       number;
  /** Whether the field is visible by default before any conditions fire. Default: true. */
  defaultVisible?: boolean;
  /** Conditional rules — empty/absent means always show. */
  conditions?:     ConditionalRule[];
}

export interface FormTemplate {
  id:          string;
  clientId:    string;
  name:        string;
  slug:        string;
  description: string | null;
  isStandard:  boolean;            // true = seeded system template, cannot be deleted
  status:      string;             // 'draft' | 'published'
  fieldSchema: FormFieldDef[];     // parsed (repository writes/reads the JSON string)
  createdAt:   Date;
  updatedAt:   Date;
}

export interface CreateFormTemplateCmd {
  clientId:    string;
  name:        string;
  slug:        string;
  description?: string | null;
  status?:     string;             // defaults to 'draft' in service layer
  fieldSchema: FormFieldDef[];
}

export interface UpdateFormTemplatePatch {
  name?:        string;
  description?: string | null;
  status?:      string;            // 'draft' | 'published'
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
