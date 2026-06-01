import type { Role } from './Role.js';

/**
 * Portal user — application-side user record. Linked to an IIdentityProvider record
 * via authUserId (e.g. Supabase auth.users.id or Entra object id).
 */
export interface PortalUser {
  id:          string;
  clientId:    string;
  authUserId:  string;
  email:       string;
  displayName: string;
  role:        Role | null;       // null = PENDING approval
  isActive:    boolean;
  createdAt:   Date;
  updatedAt:   Date;
}

export interface CreatePortalUserCmd {
  clientId:    string;
  authUserId:  string;
  email:       string;
  displayName: string;
}

/** Returned by `/users/me` and the auth middleware enrichment — includes project and org IDs. */
export interface PortalUserWithProjects extends PortalUser {
  projectIds:      string[];
  organizationIds: string[];
}
