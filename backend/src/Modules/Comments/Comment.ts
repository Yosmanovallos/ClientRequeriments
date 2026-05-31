export interface Comment {
  id:         string;
  requestId:  string;
  body:       string;
  author:     string | null;
  visibility: 'public' | 'internal';
  source:     'PORTAL' | 'TICKET';
  createdAt:  Date;
}

export interface AddCommentCmd {
  requestId:  string;
  body:       string;
  author:     string;
  clientId:   string;   // for access check
}
