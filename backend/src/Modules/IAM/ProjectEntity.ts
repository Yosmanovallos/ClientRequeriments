/**
 * A Project is a workspace inside a Client (tenant). Requests, members, and form
 * configurations live under projects. Example: client="Provana" → projects=
 * ["BLG - Power BI", "Stonebridge", "BLG - Neodeluxe"].
 *
 * The `slug` is unique within a client and used in URLs / external system tags.
 */
export interface Project {
  id:          string;
  clientId:    string;
  name:        string;
  slug:        string;          // URL-safe, unique within clientId
  description: string | null;
  isActive:    boolean;
  createdAt:   Date;
  updatedAt:   Date;
}

export interface CreateProjectCmd {
  clientId:    string;
  name:        string;
  slug:        string;
  description?: string | null;
}

export interface UpdateProjectPatch {
  name?:        string;
  description?: string | null;
  isActive?:    boolean;
}

export interface ProjectMember {
  id:        string;
  projectId: string;
  userId:    string;
  createdAt: Date;
}

/** Project + counts shown in the Control Panel project list. */
export interface ProjectSummary extends Project {
  memberCount:   number;
  requestCount:  number;
  enabledForms:  number;
}
