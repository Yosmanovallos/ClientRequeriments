import type { FormFieldDef } from './FormTemplate.js';

/**
 * The 5 standard form templates that match the service-desk reference forms.
 * Field `name` values are the stable ADO / Power Automate field identifiers —
 * do not rename them without a migration.
 *
 * Rich-text fields (type:'richtext') produce an HTML string stored in the payload.
 * Checkbox fields (type:'checkbox') store a comma-separated string, e.g. "QA,Production".
 * Attachment fields are collected by the frontend and uploaded after request creation;
 * they are NOT stored in the payload JSON.
 */

export interface StandardTemplate {
  slug:        string;
  name:        string;
  description: string;
  fieldSchema: FormFieldDef[];
}

// ── Shared fields used across multiple templates ─────────────────────────────

const SHARED_PRIORITY: FormFieldDef = {
  name: 'priority', label: 'Priority', type: 'select',
  required: true, sortOrder: 90,
  options: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
  helpText: 'Highest, High, Medium, Low, Lowest (If the priority is set to Highest, all other tasks will be paused to prioritize this request.)',
};

const SHARED_NOTES: FormFieldDef = {
  name: 'notes', label: 'Additional Notes', type: 'richtext',
  required: false, sortOrder: 95,
  helpText: 'Provide any other relevant information or special instructions, images or links from recordings.',
};

const SHARED_IMPACT: FormFieldDef = {
  name: 'impactsAutomation', label: 'Impacts Existing Automation', type: 'radio',
  required: true, sortOrder: 50,
  options: ['Yes', 'No', 'Unsure', 'N/A'],
  helpText: 'Please describe below in detail how this change will impact the existing automation.',
};

const SHARED_FILEVINE: FormFieldDef = {
  name: 'filevineId', label: 'Related Fileview ID', type: 'text',
  required: false, sortOrder: 40,
  helpText: 'Specify the Fileview project(s) that has the fields populated to appear in this report. (Used for QA purposes.)',
};

const SHARED_DUE_DATE: FormFieldDef = {
  name: 'dueDate', label: 'Requested Due Date', type: 'date',
  required: false, sortOrder: 92,
  helpText: 'Set a tentative due date. Final timing will be confirmed after review and planning.',
};

const SHARED_ATTACHMENT: FormFieldDef = {
  name: 'attachment', label: 'Attachment', type: 'attachment',
  required: false, sortOrder: 99,
  helpText: 'Provide the documentation necessary to develop.',
};

const SHARED_ENVIRONMENT: FormFieldDef = {
  name: 'environment', label: 'Environment Selection', type: 'checkbox',
  required: true, sortOrder: 75,
  options: ['QA', 'Production', 'No Preference'],
  helpText: 'Select the environment where the report should be deployed.',
};

// ── Standard templates ────────────────────────────────────────────────────────

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    slug: 'new-report',
    name: 'Create New Report',
    description: 'Request development of a completely new report.',
    fieldSchema: [
      {
        name: 'reportName', label: 'Report Name', type: 'text',
        required: true, sortOrder: 10,
        helpText: 'Specify the desired name for the new report.',
      },
      SHARED_FILEVINE,
      SHARED_IMPACT,
      {
        name: 'overallGoal', label: 'Overall Report Goal', type: 'richtext',
        required: true, sortOrder: 60,
        helpText: 'Describe the primary objective or questions the entire report aims to address, please offer as much details and context as you can.',
      },
      {
        name: 'audience', label: 'Report Audience', type: 'richtext',
        required: true, sortOrder: 70,
        helpText: 'List the names or department of the intended audience for this report.',
      },
      SHARED_ENVIRONMENT,
      SHARED_PRIORITY,
      {
        name: 'shareWith', label: 'Share with', type: 'select',
        required: true, sortOrder: 91,
        options: ['Share with Bell Legal Group', 'Share with Stonebridge Analytics', 'Do not share'],
      },
      {
        name: 'numberOfPages', label: 'Number of Pages', type: 'select',
        required: false, sortOrder: 92,
        options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'],
        helpText: 'Indicate the total number of pages envisioned for the report.',
      },
      SHARED_DUE_DATE,
      SHARED_NOTES,
      SHARED_ATTACHMENT,
    ],
  },

  {
    slug: 'new-page',
    name: 'Request New Page',
    description: 'Add a new page to an existing report.',
    fieldSchema: [
      {
        name: 'existingReport', label: 'Existing Report Name', type: 'text',
        required: true, sortOrder: 10,
        helpText: 'Enter the exact name of the existing report where the new page should be added.',
      },
      {
        name: 'pageName', label: 'Page Name', type: 'text',
        required: true, sortOrder: 20,
        helpText: 'Specify the desired name for the new page.',
      },
      SHARED_FILEVINE,
      SHARED_IMPACT,
      {
        name: 'pageGoal', label: 'Page Goal', type: 'richtext',
        required: true, sortOrder: 60,
        helpText: 'Describe the primary objective or questions this page aims to address.',
      },
      {
        name: 'audience', label: 'Report Audience', type: 'richtext',
        required: true, sortOrder: 70,
        helpText: 'List the names or department of the intended audience for this page.',
      },
      {
        name: 'fields', label: 'Fields and Sections', type: 'richtext',
        required: true, sortOrder: 80,
        helpText: 'List the fields, columns, or sections you want included on this page.',
      },
      SHARED_ENVIRONMENT,
      SHARED_PRIORITY,
      SHARED_DUE_DATE,
      SHARED_NOTES,
      SHARED_ATTACHMENT,
    ],
  },

  {
    slug: 'new-feature',
    name: 'New Feature on a Page/Report',
    description: 'Request improvements or new features for a specific page.',
    fieldSchema: [
      {
        name: 'existingReport', label: 'Existing Report Name', type: 'text',
        required: true, sortOrder: 10,
        helpText: 'Enter the exact name of the report you want to modify.',
      },
      {
        name: 'existingPage', label: 'Existing Page Name', type: 'text',
        required: true, sortOrder: 20,
        helpText: 'Enter the exact name of the page within the report.',
      },
      {
        name: 'featureDescription', label: 'Feature Description', type: 'text',
        required: true, sortOrder: 30,
        helpText: 'Provide a brief summary of the feature you are requesting.',
      },
      SHARED_FILEVINE,
      SHARED_IMPACT,
      {
        name: 'goal', label: 'Goal of the Feature', type: 'richtext',
        required: true, sortOrder: 60,
        helpText: 'Describe the business outcome this feature should achieve.',
      },
      {
        name: 'audience', label: 'Report Audience', type: 'richtext',
        required: true, sortOrder: 70,
        helpText: 'List the names or department of the intended audience.',
      },
      {
        name: 'fields', label: 'Fields and Sections', type: 'richtext',
        required: false, sortOrder: 80,
        helpText: 'List any specific fields or sections that need to change.',
      },
      SHARED_ENVIRONMENT,
      SHARED_PRIORITY,
      SHARED_DUE_DATE,
      SHARED_NOTES,
      SHARED_ATTACHMENT,
    ],
  },

  {
    slug: 'fix-issue',
    name: 'Fix Issue on a Report/Page',
    description: 'Report a bug or issue with an existing report/page.',
    fieldSchema: [
      {
        name: 'summary', label: 'Request Summary', type: 'text',
        required: true, sortOrder: 10,
        helpText: 'Briefly describe the issue in one sentence.',
      },
      {
        name: 'existingReport', label: 'Existing Report Name', type: 'text',
        required: true, sortOrder: 20,
        helpText: 'Enter the exact name of the report with the issue.',
      },
      {
        name: 'existingPage', label: 'Existing Page Name', type: 'text',
        required: true, sortOrder: 30,
        helpText: 'Enter the exact name of the page with the issue.',
      },
      SHARED_FILEVINE,
      SHARED_IMPACT,
      {
        name: 'issueDetails', label: 'Issue Details', type: 'richtext',
        required: true, sortOrder: 60,
        helpText: 'Describe the issue in detail. Include what you expected to see vs what you actually see.',
      },
      SHARED_ENVIRONMENT,
      SHARED_PRIORITY,
      SHARED_DUE_DATE,
      SHARED_NOTES,
      SHARED_ATTACHMENT,
    ],
  },

  {
    slug: 'view-request',
    name: 'View Request',
    description: 'Request the creation, editing, or deletion of a data warehouse view.',
    fieldSchema: [
      {
        name: 'typeOfRequest', label: 'Type of Request', type: 'radio',
        required: true, sortOrder: 10,
        options: ['New View', 'Edit Existing View', 'Delete View', 'Other'],
        helpText: 'Select the type of change you need for the data warehouse view.',
      },
      {
        name: 'viewName', label: 'Name of the View', type: 'text',
        required: true, sortOrder: 20,
        helpText: 'Enter the exact name of the view (existing or desired).',
      },
      SHARED_FILEVINE,
      SHARED_IMPACT,
      {
        name: 'details', label: 'Details', type: 'richtext',
        required: true, sortOrder: 60,
        helpText: 'Describe the full scope of changes needed for this view.',
      },
      {
        name: 'goal', label: 'Goal of the Request', type: 'richtext',
        required: true, sortOrder: 70,
        helpText: 'Describe the business objective this view change should achieve.',
      },
      {
        name: 'fields', label: 'Fields and Sections', type: 'richtext',
        required: true, sortOrder: 80,
        helpText: 'List all fields, columns, or joins that should be included.',
      },
      {
        name: 'conditions', label: 'Conditions of Inclusion/Exclusion', type: 'richtext',
        required: true, sortOrder: 85,
        helpText: 'Describe any filter conditions or business rules for this view.',
      },
      SHARED_ENVIRONMENT,
      SHARED_PRIORITY,
      SHARED_DUE_DATE,
      SHARED_NOTES,
      SHARED_ATTACHMENT,
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
