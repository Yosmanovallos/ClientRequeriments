import { api } from './client';

export interface RequestSummary {
  id:             string;
  reference:      string;
  requestType:    string;
  title:          string;
  status:         string;
  priority:       string;
  dueDate:        string | null;
  projectId:      string | null;
  organizationId: string | null;
  createdBy:      string | null;
  createdAt:      string;
  updatedAt:      string;
  adoWorkItemId:  string | null;
  adoWorkItemUrl: string | null;
  payloadData:    Record<string, unknown>;
}

export interface StatusHistoryEntry {
  id:          string;
  fromStatus:  string | null;
  toStatus:    string;
  changedAt:   string;
  source:      string;
  actor:       string | null;
}

export interface RequestDetail extends RequestSummary {
  history: StatusHistoryEntry[];
}

export interface Comment {
  id:           string;
  requestId:    string;
  body:         string;         // sanitized HTML; legacy plain-text bodies start without '<'
  author:       string | null;
  authorUserId: string | null;
  source:       string;
  createdAt:    string;
}

export interface CreateRequestBody {
  requestType:     string;
  title:           string;
  priority:        string;
  dueDate?:        string | null;
  payload:         Record<string, unknown>;
  idempotencyKey?: string | null;
  projectId?:      string | null;
  organizationId?: string | null;
}

export const requestsApi = {
  create(body: CreateRequestBody) {
    return api.post<RequestSummary>('/requests', body);
  },
  list(filters?: { status?: string; projectId?: string }) {
    const params = new URLSearchParams();
    if (filters?.status)    params.set('status',    filters.status);
    if (filters?.projectId) params.set('projectId', filters.projectId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api.get<{ data: RequestSummary[]; count: number }>(`/requests${qs}`);
  },
  getDetail(id: string) {
    return api.get<RequestDetail>(`/requests/${id}`);
  },
  addComment(requestId: string, body: string) {
    return api.post<Comment>(`/requests/${requestId}/comments`, { body });
  },
  listComments(requestId: string) {
    return api.get<{ data: Comment[] }>(`/requests/${requestId}/comments`);
  },
};
