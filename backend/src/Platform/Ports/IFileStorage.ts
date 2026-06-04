export interface FileRef {
  key: string;
  url: string;
}

export interface IFileStorage {
  /** Upload a file and return its storage key + public/signed URL. */
  upload(key: string, data: Buffer, contentType: string): Promise<FileRef>;
  /** Return a short-lived signed URL for a stored file. */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Download a stored file. Returns null if the key does not exist. */
  download(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  /** Permanently delete a stored file. */
  delete(key: string): Promise<void>;
}
