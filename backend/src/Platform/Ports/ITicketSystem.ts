export interface CreateTicketCmd {
  title: string;
  body: string;
  labels?: string[];
  priority?: string;
  requestReference: string;
  requestType: string;
  requesterEmail: string;
}

export interface TicketRef {
  externalId: string;
  externalUrl: string;
}

export interface ITicketSystem {
  /** Create a new work item / issue and return its external reference. */
  create(cmd: CreateTicketCmd): Promise<TicketRef>;
  /** Push a status change to the external system. */
  updateStatus(externalId: string, status: string): Promise<void>;
  /** Append a comment to an existing work item. */
  addComment(externalId: string, body: string): Promise<void>;
}
