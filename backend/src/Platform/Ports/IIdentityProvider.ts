export interface UserIdentity {
  userId:      string;
  clientId:    string;
  email:       string;
  displayName: string;
  /**
   * Application role. NOT returned by the identity provider (which only knows tokens) —
   * the auth middleware enriches this from PortalUser.role after token verification.
   * `null` means the user is PENDING approval — no role assigned yet.
   */
  role?:       string | null;
  /** Project IDs the user has access to. Enriched in middleware from ProjectMember rows. */
  projectIds?: string[];
  /** Organization IDs the user belongs to. Enriched in middleware from OrganizationMember rows. */
  organizationIds?: string[];
  /** Whether the user account is currently active. Enriched in middleware. */
  isActive?:   boolean;
  /**
   * The portal_users.id primary key (UUID). Distinct from userId (auth provider sub).
   * Enriched in middleware. Use this for FK references to portal_users (e.g. comments.author_user_id).
   */
  portalUserId?: string;
}

export interface IIdentityProvider {
  /** Verify a Bearer token and return the resolved user identity (base fields only). */
  verify(token: string): Promise<UserIdentity>;
}
