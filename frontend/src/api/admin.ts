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
  id:             string;
  name:           string;
  slug:           string;
  description:    string | null;
  iconUrl:        string | null;
  memberCount:    number;
  requestCount:   number;
  formCount:      number;
  isActive:       boolean;
  adoProjectId:   string | null;
  adoProjectName: string | null;
}

export interface AdoProject {
  id:          string;
  name:        string;
  description: string | null;
  url:         string;
}

export interface Organization {
  id:           string;
  clientId:     string;
  projectId:    string;
  name:         string;
  description:  string | null;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
  memberCount?: number;
}

export interface ProjectMember {
  id:        string;
  projectId: string;
  userId:    string;
  createdAt: string;
}

export interface OrgMember {
  id:             string;
  organizationId: string;
  userId:         string;
  createdAt:      string;
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
  setActive:      (id: string, isActive: boolean) =>
    api.patch<PortalUser>(`/users/${id}/active`, { isActive }),
};

export const projectsApi = {
  list:         () => api.get<{ data: AdminProject[]; count: number }>('/projects'),
  create:       (data: {
    name: string; slug?: string; description?: string | null; iconUrl?: string | null;
    adoProjectId?: string | null; adoProjectName?: string | null;
  }) => api.post<AdminProject>('/projects', data),
  update:       (id: string, data: Partial<{
    name: string; description: string | null; iconUrl: string | null; isActive: boolean;
    adoProjectId: string | null; adoProjectName: string | null;
  }>) => api.patch<AdminProject>(`/projects/${id}`, data),
  members:      (id: string) => api.get<{ data: ProjectMember[]; count: number }>(`/projects/${id}/members`),
  addMember:    (id: string, userId: string) => api.post<void>(`/projects/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => api.delete<void>(`/projects/${id}/members/${userId}`),
};

export const adoProjectsApi = {
  listAvailable: () => api.get<{ data: AdoProject[]; count: number }>('/projects/ado-available'),
};

export const orgsApi = {
  list:         (projectId: string) =>
    api.get<{ data: Organization[]; count: number }>(`/projects/${projectId}/organizations`),
  create:       (projectId: string, data: { name: string; description?: string | null }) =>
    api.post<Organization>(`/projects/${projectId}/organizations`, data),
  update:       (projectId: string, orgId: string, data: { name?: string; description?: string | null; isActive?: boolean }) =>
    api.patch<Organization>(`/projects/${projectId}/organizations/${orgId}`, data),
  delete:       (projectId: string, orgId: string) =>
    api.delete<void>(`/projects/${projectId}/organizations/${orgId}`),
  listMembers:  (projectId: string, orgId: string) =>
    api.get<{ data: OrgMember[]; count: number }>(`/projects/${projectId}/organizations/${orgId}/members`),
  addMember:    (projectId: string, orgId: string, userId: string) =>
    api.post<OrgMember>(`/projects/${projectId}/organizations/${orgId}/members`, { userId }),
  removeMember: (projectId: string, orgId: string, userId: string) =>
    api.delete<void>(`/projects/${projectId}/organizations/${orgId}/members/${userId}`),
};
