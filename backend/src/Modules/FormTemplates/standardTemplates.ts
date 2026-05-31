import type { FormFieldDef } from './FormTemplate.js';

/**
 * The 5 standard form templates that match the legacy hardcoded forms.
 * Seeded per-client on first boot — frontend renders them via the dynamic form renderer
 * so the user experience matches the old hardcoded views exactly.
 *
 * Adding a new field here: bump the template's slug-version or accept that existing
 * requests reference an older shape via their stored payload JSON.
 */

export interface StandardTemplate {
  slug:        string;
  name:        string;
  description: string;
  fieldSchema: FormFieldDef[];
}

const SHARED_PRIORITY_FIELD: FormFieldDef = {
  name: 'priority', label: 'Priority', type: 'select',
  required: true, sortOrder: 90,
  options: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
};

const SHARED_NOTES_FIELD: FormFieldDef = {
  name: 'notes', label: 'Additional Notes', type: 'textarea',
  required: false, sortOrder: 95,
};

const SHARED_IMPACT_FIELD: FormFieldDef = {
  name: 'impactsExistingAutomation', label: 'Impacts Existing Automation', type: 'select',
  required: true, sortOrder: 50,
  options: ['Yes', 'No', 'Unsure', 'N/A'],
};

const SHARED_FILEVINE_FIELD: FormFieldDef = {
  name: 'filevineId', label: 'Related Filevine ID', type: 'text',
  required: false, sortOrder: 40,
};

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    slug: 'new-report',
    name: 'Create New Report',
    description: 'Request development of a completely new report.',
    fieldSchema: [
      { name: 'reportName',   label: 'Report Name',          type: 'text',     required: true,  sortOrder: 10 },
      SHARED_FILEVINE_FIELD,
      SHARED_IMPACT_FIELD,
      { name: 'overallGoal',  label: 'Overall Report Goal',  type: 'textarea', required: true,  sortOrder: 60 },
      { name: 'audience',     label: 'Report Audience',      type: 'textarea', required: true,  sortOrder: 70 },
      SHARED_PRIORITY_FIELD,
      { name: 'dueDate',      label: 'Requested Due Date',   type: 'date',     required: false, sortOrder: 92 },
      SHARED_NOTES_FIELD,
    ],
  },
  {
    slug: 'new-page',
    name: 'Request New Page',
    description: 'Add a new page to an existing report.',
    fieldSchema: [
      { name: 'existingReport', label: 'Existing Report Name', type: 'text',     required: true,  sortOrder: 10 },
      { name: 'pageName',       label: 'Page Name',            type: 'text',     required: true,  sortOrder: 20 },
      SHARED_FILEVINE_FIELD,
      SHARED_IMPACT_FIELD,
      { name: 'pageGoal',       label: 'Page Goal',            type: 'textarea', required: true,  sortOrder: 60 },
      { name: 'audience',       label: 'Report Audience',      type: 'textarea', required: true,  sortOrder: 70 },
      { name: 'fields',         label: 'Fields and Sections',  type: 'textarea', required: true,  sortOrder: 80 },
      SHARED_PRIORITY_FIELD,
      { name: 'dueDate',        label: 'Requested Due Date',   type: 'date',     required: false, sortOrder: 92 },
      SHARED_NOTES_FIELD,
    ],
  },
  {
    slug: 'new-feature',
    name: 'New Feature on a Page/Report',
    description: 'Request improvements or new features for a specific page.',
    fieldSchema: [
      { name: 'existingReport',     label: 'Existing Report Name', type: 'text',     required: true,  sortOrder: 10 },
      { name: 'existingPage',       label: 'Existing Page Name',   type: 'text',     required: true,  sortOrder: 20 },
      { name: 'featureDescription', label: 'Feature Description',  type: 'text',     required: true,  sortOrder: 30 },
      SHARED_FILEVINE_FIELD,
      SHARED_IMPACT_FIELD,
      { name: 'goal',               label: 'Goal of the Feature',  type: 'textarea', required: true,  sortOrder: 60 },
      { name: 'audience',           label: 'Report Audience',      type: 'textarea', required: true,  sortOrder: 70 },
      { name: 'fields',             label: 'Fields and Sections',  type: 'textarea', required: false, sortOrder: 80 },
      SHARED_PRIORITY_FIELD,
      { name: 'dueDate',            label: 'Requested Due Date',   type: 'date',     required: false, sortOrder: 92 },
      SHARED_NOTES_FIELD,
    ],
  },
  {
    slug: 'fix-issue',
    name: 'Fix Issue on a Report/Page',
    description: 'Report a bug or issue with an existing report/page.',
    fieldSchema: [
      { name: 'summary',         label: 'Request Summary',     type: 'text',     required: true,  sortOrder: 10 },
      { name: 'existingReport',  label: 'Existing Report Name', type: 'text',     required: true,  sortOrder: 20 },
      { name: 'existingPage',    label: 'Existing Page Name',   type: 'text',     required: true,  sortOrder: 30 },
      SHARED_FILEVINE_FIELD,
      SHARED_IMPACT_FIELD,
      { name: 'issueDetails',    label: 'Issue Details',        type: 'textarea', required: true,  sortOrder: 60 },
      SHARED_PRIORITY_FIELD,
      { name: 'dueDate',         label: 'Requested Due Date',   type: 'date',     required: false, sortOrder: 92 },
      SHARED_NOTES_FIELD,
    ],
  },
  {
    slug: 'view-request',
    name: 'View Request',
    description: 'Request the creation, editing, or deletion of a data warehouse view.',
    fieldSchema: [
      { name: 'typeOfRequest', label: 'Type of Request', type: 'select', required: true, sortOrder: 10,
        options: ['New View', 'Edit Existing View', 'Delete View', 'Other'] },
      { name: 'viewName',      label: 'Name of the View', type: 'text',     required: true,  sortOrder: 20 },
      SHARED_FILEVINE_FIELD,
      SHARED_IMPACT_FIELD,
      { name: 'details',       label: 'Details',           type: 'textarea', required: true,  sortOrder: 60 },
      { name: 'goal',          label: 'Goal of the Request', type: 'textarea', required: true, sortOrder: 70 },
      { name: 'fields',        label: 'Fields and Sections', type: 'textarea', required: true, sortOrder: 80 },
      { name: 'conditions',    label: 'Conditions of Inclusion/Exclusion', type: 'textarea', required: true, sortOrder: 85 },
      SHARED_PRIORITY_FIELD,
      { name: 'dueDate',       label: 'Requested Due Date',  type: 'date',     required: false, sortOrder: 92 },
      SHARED_NOTES_FIELD,
    ],
  },
];

/**
 * Idempotent seeding helper — call this on startup or via `npm run db:seed`.
 * Creates the 5 standard templates per client if they don't already exist.
 */
export async function seedStandardTemplates(
  clientId: string,
  repo: { findBySlug(c: string, s: string): Promise<unknown>; create(cmd: unknown): Promise<unknown> },
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const std of STANDARD_TEMPLATES) {
    const existing = await repo.findBySlug(clientId, std.slug);
    if (existing) { skipped++; continue; }
    await repo.create({
      clientId,
      name:        std.name,
      slug:        std.slug,
      description: std.description,
      fieldSchema: std.fieldSchema,
      isStandard:  true,
    });
    created++;
  }
  return { created, skipped };
}
