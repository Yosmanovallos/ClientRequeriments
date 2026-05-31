/**
 * Type definitions for the subset of GitHub webhook payloads we consume.
 * Only the fields we actually read are typed — GitHub's full schemas are huge and noisy.
 * See https://docs.github.com/en/webhooks/webhook-events-and-payloads for the full reference.
 */

export type GitHubEventName = 'ping' | 'issues' | 'issue_comment' | string;

export interface GitHubIssuesPayload {
  /** "opened" | "closed" | "reopened" | "edited" | "labeled" | "assigned" | ... — we only act on closed/reopened */
  action: string;
  issue: {
    number: number;
    state: 'open' | 'closed';
    state_reason: 'completed' | 'not_planned' | 'reopened' | null;
    title: string;
    html_url: string;
    user: { login: string };
  };
  sender: { login: string };
}

export interface GitHubIssueCommentPayload {
  /** "created" | "edited" | "deleted" — we only act on created */
  action: string;
  issue: { number: number };
  comment: {
    id: number;
    body: string;
    user: { login: string };
    html_url: string;
  };
  sender: { login: string };
}
