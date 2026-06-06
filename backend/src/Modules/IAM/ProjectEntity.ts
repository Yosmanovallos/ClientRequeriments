/**
 * A Project is a workspace inside a Client (tenant). Requests, members, and form
 * configurations live under projects. Example: client="Provana" → projects=
 * ["BLG - Power BI", "Stonebridge", "BLG - Neodeluxe"].
 *
 * The `slug` is unique within a client and used in URLs / external system tags.
 */
export interface Project {
  id:             string;
  clientId:       string;
  name:           string;
  slug:           string;          // URL-safe, unique within clientId
  description:    string | null;
  iconUrl:        string | null;  // project logo — base64 data URL or external URL
  isActive:       boolean;
  prefix:         string | null;  // request reference prefix, e.g. CFGMBR, CSNDBR, CBLGBR
  adoProjectId:   string | null;  // ADO project GUID; null for legacy local or non-ADO projects
  adoProjectName: string | null;  // denormalized ADO display name
  createdAt:      Date;
  updatedAt:      Date;
}

export interface CreateProjectCmd {
  clientId:       string;
  name:           string;
  slug:           string;
  description?:   string | null;
  iconUrl?:       string | null;
  adoProjectId?:  string | null;
  adoProjectName?: string | null;
}

export interface UpdateProjectPatch {
  name?:           string;
  description?:    string | null;
  iconUrl?:        string | null;
  isActive?:       boolean;
  prefix?:         string | null;
  adoProjectId?:   string | null;
  adoProjectName?: string | null;
}

export interface ProjectMember {
  id:        string;
  projectId: string;
  userId:    string;
  createdAt: Date;
}

/** Project + counts shown in the Control Panel project list. */
export interface ProjectSummary extends Project {
  memberCount:  number;
  requestCount: number;
  formCount:    number;
}
