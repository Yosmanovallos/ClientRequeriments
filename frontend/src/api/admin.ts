import { api } from './client';

export interface PortalUser {
  id:          string;
  email:       string;
  displayName: string | null;
  role:        string | null;
  isActive:    boolean;
  projectIds:  string[];
  createdAt:   string;
}

export interface AdminProject {
  id:           string;
  name:         string;
  slug:         string;
  description:  string | null;
  iconUrl:      string | null;
  memberCount:  number;
  requestCount: number;
  formCount:    number;
  isActive:     boolean;
}

export const usersApi = {
  list:           () => api.get<{ data: PortalUser[]; count: number }>('/users'),
  pending:        () => api.get<{ data: PortalUser[]; count: number }>('/users/pending'),
  updateRole:     (id: string, role: string | null) =>
    api.patch<PortalUser>(`/users/${id}/role`, { role }),
  updateProjects: (id: string, projectIds: string[]) =>
    api.patch<void>(`/users/${id}/projects`, { projectIds }),
  setup:          (id: string, role: string | null, projectIds: string[]) =>
    api.patch<PortalUser>(`/users/${id}`, { role, projectIds }),
};

export const projectsApi = {
  list:         () => api.get<{ data: AdminProject[]; count: number }>('/projects'),
  create:       (data: { name: string; slug: string; description?: string; iconUrl?: string | null }) =>
    api.post<AdminProject>('/projects', data),
  update:       (id: string, data: Partial<{ name: string; description: string | null; iconUrl: string | null; isActive: boolean }>) =>
    api.patch<AdminProject>(`/projects/${id}`, data),
  members:      (id: string) => api.get<{ data: PortalUser[]; count: number }>(`/projects/${id}/members`),
  addMember:    (id: string, userId: string) => api.post<void>(`/projects/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => api.delete<void>(`/projects/${id}/members/${userId}`),
};
