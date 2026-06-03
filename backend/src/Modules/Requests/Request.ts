export const REQUEST_STATUSES = [
  'NEW', 'IN REVIEW', 'APPROVED', 'IN DEVELOPMENT',
  'UAT', 'CUSTOMER FEEDBACK', 'DONE', 'CANCELLED', 'ON HOLD',
] as const;

export type RequestStatus = typeof REQUEST_STATUSES[number];

/** Legacy built-in types kept for reference; requestType now accepts any form-template slug. */
export const REQUEST_TYPES = [
  'new_report', 'new_page', 'new_feature', 'fix_issue', 'view_request',
] as const;

export type RequestType = string;

export interface Request {
  id:               string;
  clientId:         string;
  projectId:        string | null;    // project this request belongs to
  organizationId:   string | null;    // optional org scope for ticket visibility
  organizationName: string | null;    // denormalized from Organization.name for list views
  templateId:      string | null;    // which FormTemplate produced this request
  reference:       string;           // e.g. CBLPBR-629
  requestType:     RequestType;
  title:           string;
  status:          RequestStatus;
  priority:        string;
  dueDate:         Date | null;
  payload:         string;           // JSON string — portable to SQL Server nvarchar(max)
  idempotencyKey:  string | null;
  createdBy:       string | null;    // email of submitter; null for legacy requests
  adoWorkItemId:   string | null;
  adoWorkItemUrl:  string | null;
  adoProjectName:  string | null;  // denormalized from Project.adoProjectName at creation
  adoAssignedTo:   string | null;  // synced from ADO System.AssignedTo via webhook
  createdAt:       Date;
  updatedAt:       Date;
}

export interface StatusHistoryEntry {
  id:          string;
  requestId:   string;
  fromStatus:  string | null;
  toStatus:    string;
  changedAt:   Date;
  source:      string;   // 'portal' | 'ticket' | 'system'
  actor:       string | null;
}

export interface CreateRequestCmd {
  clientId:        string;
  projectId:       string | null;
  organizationId:  string | null;
  templateId?:     string | null;    // used for server-side condition validation
  requestType:     RequestType;
  title:           string;
  priority:        string;
  dueDate:         Date | null;
  payload:         Record<string, unknown>;
  idempotencyKey:  string | null;
  createdBy:       string;           // email
  adoProjectName?: string | null;    // passed from endpoint layer; written to DB and used for targetProjectId
}
