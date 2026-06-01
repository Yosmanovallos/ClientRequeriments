export interface Organization {
  id:           string;
  clientId:     string;
  projectId:    string;
  name:         string;
  description:  string | null;
  isActive:     boolean;
  createdAt:    Date;
  updatedAt:    Date;
  memberCount?: number;
}

export interface CreateOrganizationCmd {
  clientId:    string;
  projectId:   string;
  name:        string;
  description: string | null;
}

export interface UpdateOrganizationPatch {
  name?:        string;
  description?: string | null;
  isActive?:    boolean;
}

export interface OrganizationMemberRow {
  id:             string;
  organizationId: string;
  userId:         string;
  createdAt:      Date;
}
