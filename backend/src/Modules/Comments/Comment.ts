export interface Comment {
  id:           string;
  requestId:    string;
  body:         string;           // sanitized HTML (rich text); legacy rows are plain text
  author:       string | null;    // denormalized display name (kept for TICKET-source comments)
  authorUserId: string | null;    // FK to portal_users; null for TICKET-sourced comments
  visibility:   'public' | 'internal';
  source:       'PORTAL' | 'TICKET';
  adoCommentId: string | null;    // ADO comment ID stored to prevent webhook echo duplicates
  createdAt:    Date;
}

export interface AddCommentCmd {
  requestId:    string;
  body:         string;           // raw HTML from client; service sanitizes before persisting
  author:       string;
  authorUserId: string;           // from req.user.userId
  clientId:     string;           // for access check
}
