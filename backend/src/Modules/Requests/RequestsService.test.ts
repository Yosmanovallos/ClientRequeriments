import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestsService } from './RequestsService.js';
import { InMemoryRequestsRepository } from './RequestsRepository.js';
import type { ITicketSystem } from '../../Platform/Ports/ITicketSystem.js';
import type { INotifier }      from '../../Platform/Ports/INotifier.js';
import type { IClock }         from '../../Platform/Ports/IClock.js';

const DEMO_CLIENT = '00000000-0000-0000-0000-000000000001';

/** Test doubles — no external services touched. */
function makeMocks() {
  const tickets: ITicketSystem = {
    create:       vi.fn(async () => ({ externalId: 'TKT-1', externalUrl: 'http://t/1' })),
    updateStatus: vi.fn(async () => undefined),
    addComment:   vi.fn(async () => undefined),
  };
  const notifier: INotifier = {
    sendEmail:          vi.fn(async () => undefined),
    sendChannelMessage: vi.fn(async () => undefined),
  };
  const clock: IClock = { now: () => new Date('2026-05-29T12:00:00Z') };
  return { tickets, notifier, clock };
}

function makeService() {
  const repo = new InMemoryRequestsRepository();
  const { tickets, notifier, clock } = makeMocks();
  const svc  = new RequestsService({ repo, tickets, notifier, clock });
  return { svc, repo, tickets, notifier };
}

describe('RequestsService', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  describe('create()', () => {
    it('assigns a CBLPBR-### reference for the demo client', async () => {
      const result = await ctx.svc.create({
        clientId: DEMO_CLIENT, requestType: 'new_report', title: 'Test',
        priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null,
        createdBy: 'tester@example.com',
      });
      expect(result.reference).toMatch(/^CBLPBR-\d+$/);
      expect(result.status).toBe('NEW');
      expect(result.title).toBe('Test');
    });

    it('persists the payload as a JSON string and exposes parsed payloadData', async () => {
      const result = await ctx.svc.create({
        clientId: DEMO_CLIENT, requestType: 'new_report', title: 'Test',
        priority: 'Medium', dueDate: null,
        payload: { overallGoal: 'goal-text', audience: 'team' },
        idempotencyKey: null, createdBy: 'tester@example.com',
      });
      expect(result.payload).toBe('{"overallGoal":"goal-text","audience":"team"}');
      expect(result.payloadData).toEqual({ overallGoal: 'goal-text', audience: 'team' });
    });

    it('returns the existing request when the same idempotencyKey is replayed', async () => {
      const cmd = {
        clientId: DEMO_CLIENT, requestType: 'new_report' as const, title: 'Idem',
        priority: 'High', dueDate: null, payload: {},
        idempotencyKey: 'unique-key-1', createdBy: 'tester@example.com',
      };
      const first  = await ctx.svc.create(cmd);
      const second = await ctx.svc.create(cmd);
      expect(second.id).toBe(first.id);
      expect(second.reference).toBe(first.reference);
    });

    it('issues sequential references for the same client', async () => {
      const a = await ctx.svc.create({ clientId: DEMO_CLIENT, requestType: 'new_report', title: 'A', priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null, createdBy: 't' });
      const b = await ctx.svc.create({ clientId: DEMO_CLIENT, requestType: 'new_report', title: 'B', priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null, createdBy: 't' });
      const seqA = Number(a.reference.split('-')[1]);
      const seqB = Number(b.reference.split('-')[1]);
      expect(seqB).toBe(seqA + 1);
    });
  });

  describe('list() + getDetail()', () => {
    it('returns only the calling client\'s requests (tenant isolation)', async () => {
      const OTHER = '99999999-9999-9999-9999-999999999999';
      await ctx.svc.create({ clientId: DEMO_CLIENT, requestType: 'new_report', title: 'Mine',  priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null, createdBy: 't' });
      await ctx.svc.create({ clientId: OTHER,       requestType: 'new_report', title: 'Theirs',priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null, createdBy: 't' });

      const mine = await ctx.svc.list(DEMO_CLIENT);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.title).toBe('Mine');
    });

    it('throws notFound when a different client tries to read a request', async () => {
      const r = await ctx.svc.create({ clientId: DEMO_CLIENT, requestType: 'new_report', title: 'Hidden', priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null, createdBy: 't' });
      await expect(ctx.svc.getDetail(r.id, 'wrong-client')).rejects.toThrow(/not found/i);
    });

    it('returns a history row with toStatus=NEW after create', async () => {
      const r = await ctx.svc.create({ clientId: DEMO_CLIENT, requestType: 'new_report', title: 'H', priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null, createdBy: 't' });
      const history = await ctx.svc.getHistory(r.id, DEMO_CLIENT);
      expect(history).toHaveLength(1);
      expect(history[0]!.toStatus).toBe('NEW');
      expect(history[0]!.fromStatus).toBeNull();
    });
  });
});
