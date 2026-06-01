export interface Attachment {
  id:          string;
  requestId:   string;
  clientId:    string;
  commentId:   string | null;   // set when the attachment is scoped to a comment (nullable)
  fileName:    string;
  contentType: string;
  size:        number;          // bytes
  storageKey:  string;          // key in IFileStorage
  uploadedBy:  string;          // email
  uploadedAt:  Date;
}

export interface UploadAttachmentCmd {
  requestId:   string;
  clientId:    string;
  commentId?:  string | null;
  fileName:    string;
  contentType: string;
  data:        Buffer;
  uploadedBy:  string;
}

/** Returned to the client — same shape as Attachment but with a short-lived signed URL. */
export interface AttachmentView extends Attachment {
  signedUrl: string;
}

/** Max upload size in bytes — protects the backend from giant uploads. 25 MiB is generous for documents/screenshots. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
