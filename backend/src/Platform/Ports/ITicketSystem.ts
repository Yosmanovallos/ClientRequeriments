export interface CreateTicketCmd {
  title: string;
  body: string;
  labels?: string[];
  priority?: string;
  requestReference: string;
  requestType: string;
  requesterEmail: string;
  /** ADO project GUID or name to target; overrides adapter default when provided. */
  targetProjectId?: string;
}

export interface TicketRef {
  externalId: string;
  externalUrl: string;
}

export interface ExternalProject {
  id:          string;
  name:        string;
  description: string | null;
  url:         string;
}

export interface WorkItemFilters {
  state?: string;
  type?:  string;
  top?:   number;
}

export interface WorkItemSummary {
  id:       string;
  title:    string;
  state:    string;
  priority: number | null;
  url:      string;
}

export interface WorkItemDetail extends WorkItemSummary {
  description: string | null;
  assignedTo:  string | null;
  dueDate:     string | null;
  createdAt:   string;
  createdBy:   string | null;
}

export interface ExternalComment {
  id:        string;
  body:      string;
  author:    string | null;
  createdAt: string;
}

export interface ITicketSystem {
  /** Create a new work item / issue and return its external reference. */
  create(cmd: CreateTicketCmd): Promise<TicketRef>;
  /** Push a status change to the external system. */
  updateStatus(externalId: string, status: string, targetProjectId?: string): Promise<void>;
  /** Append a comment to an existing work item. */
  addComment(externalId: string, body: string, targetProjectId?: string): Promise<void>;

  /** List all projects/repositories available in the external system. */
  listExternalProjects(): Promise<ExternalProject[]>;
  /** List work items in a given external project, with optional filters. */
  listExternalWorkItems(projectId: string, filters?: WorkItemFilters): Promise<WorkItemSummary[]>;
  /** Fetch full detail for a single work item. */
  getExternalWorkItem(projectId: string, workItemId: string): Promise<WorkItemDetail>;
  /** Fetch comments for a work item. */
  listExternalWorkItemComments(projectId: string, workItemId: string): Promise<ExternalComment[]>;
}
