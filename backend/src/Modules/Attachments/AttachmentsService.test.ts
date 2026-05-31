import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttachmentsService } from './AttachmentsService.js';
import { InMemoryAttachmentsRepository } from './AttachmentsRepository.js';
import { InMemoryRequestsRepository }    from '../Requests/RequestsRepository.js';
import { RequestsService }               from '../Requests/RequestsService.js';
import type { IFileStorage }             from '../../Platform/Ports/IFileStorage.js';
import type { ITicketSystem }            from '../../Platform/Ports/ITicketSystem.js';
import type { INotifier }                from '../../Platform/Ports/INotifier.js';
import type { IClock }                   from '../../Platform/Ports/IClock.js';

const CLIENT_A = '00000000-0000-0000-0000-000000000001';
const CLIENT_B = '00000000-0000-0000-0000-000000000002';

/** Build a stack with one seeded request for `clientId`. */
async function buildStack(clientId = CLIENT_A) {
  const attRepo = new InMemoryAttachmentsRepository();
  const reqRepo = new InMemoryRequestsRepository();

  const storage: IFileStorage = {
    upload:       vi.fn(async (key, _data, _ct) => ({ key, url: `https://store/${key}` })),
    getSignedUrl: vi.fn(async (key, _exp) => `https://store/signed/${key}?sig=test`),
    delete:       vi.fn(async () => undefined),
  };
  const tickets: ITicketSystem = {
    create:       vi.fn(async () => ({ externalId: '1', externalUrl: 'x' })),
    updateStatus: vi.fn(async () => undefined),
    addComment:   vi.fn(async () => undefined),
  };
  const notifier: INotifier = { sendEmail: vi.fn(), sendChannelMessage: vi.fn() } as never;
  const clock: IClock = { now: () => new Date('2026-05-29T12:00:00Z') };

  const reqSvc = new RequestsService({ repo: reqRepo, tickets, notifier, clock });
  const svc    = new AttachmentsService({ attachments: attRepo, requests: reqRepo, storage });

  const req = await reqSvc.create({
    clientId, requestType: 'new_report', title: 'Seeded',
    priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null,
    createdBy: 'tester@example.com',
  });

  return { svc, storage, requestId: req.id, attRepo };
}

describe('AttachmentsService.upload()', () => {
  it('uploads via IFileStorage and persists metadata', async () => {
    const { svc, storage, requestId } = await buildStack();
    const data = Buffer.from('hello world');

    const view = await svc.upload({
      requestId, clientId: CLIENT_A,
      fileName: 'requirements.pdf', contentType: 'application/pdf',
      data, uploadedBy: 'tester@example.com',
    });

    expect(view.fileName).toBe('requirements.pdf');
    expect(view.contentType).toBe('application/pdf');
    expect(view.size).toBe(data.length);
    expect(view.signedUrl).toContain('signed');

    // Storage key uses {clientId}/{requestId}/{attId}/{filename}
    expect(view.storageKey).toMatch(new RegExp(`^${CLIENT_A}/${requestId}/[0-9a-f-]+/requirements\\.pdf$`));

    // Verify storage.upload was called with the same key + data + content type
    expect(storage.upload).toHaveBeenCalledWith(view.storageKey, data, 'application/pdf');
  });

  it('sanitises filenames with unsafe characters', async () => {
    const { svc, requestId } = await buildStack();
    const view = await svc.upload({
      requestId, clientId: CLIENT_A,
      fileName: 'file with spaces & emoji 🚀.png', contentType: 'image/png',
      data: Buffer.from('binary'), uploadedBy: 'a@b.com',
    });
    // Spaces / & / emoji collapse to underscores; dot and dash preserved
    expect(view.storageKey).toMatch(/file_with_spaces___emoji_*\.png$/);
  });

  it('throws notFound when the request belongs to a different client (tenant isolation)', async () => {
    const { svc, requestId } = await buildStack(CLIENT_A);
    await expect(svc.upload({
      requestId, clientId: CLIENT_B,                  // wrong client
      fileName: 'x', contentType: 'text/plain',
      data: Buffer.from(''), uploadedBy: 'b@b.com',
    })).rejects.toThrow(/not found/i);
  });

  it('throws notFound when the request id does not exist', async () => {
    const { svc } = await buildStack();
    await expect(svc.upload({
      requestId: 'no-such-id', clientId: CLIENT_A,
      fileName: 'x', contentType: 'text/plain',
      data: Buffer.from(''), uploadedBy: 'a@b.com',
    })).rejects.toThrow(/not found/i);
  });
});

describe('AttachmentsService.list()', () => {
  it('returns all uploaded files for the request with fresh signed URLs', async () => {
    const { svc, requestId } = await buildStack();
    await svc.upload({ requestId, clientId: CLIENT_A, fileName: 'a.pdf', contentType: 'application/pdf', data: Buffer.from('a'), uploadedBy: 't@t.com' });
    await svc.upload({ requestId, clientId: CLIENT_A, fileName: 'b.txt', contentType: 'text/plain',     data: Buffer.from('b'), uploadedBy: 't@t.com' });

    const list = await svc.list(requestId, CLIENT_A);
    expect(list).toHaveLength(2);
    expect(list.every(a => a.signedUrl.includes('signed'))).toBe(true);
  });

  it('throws notFound when called by a different client (tenant isolation)', async () => {
    const { svc, requestId } = await buildStack(CLIENT_A);
    await expect(svc.list(requestId, CLIENT_B)).rejects.toThrow(/not found/i);
  });

  it('returns empty list when no attachments uploaded yet', async () => {
    const { svc, requestId } = await buildStack();
    expect(await svc.list(requestId, CLIENT_A)).toEqual([]);
  });
});

describe('AttachmentsService.remove()', () => {
  it('deletes from storage first, then DB row', async () => {
    const { svc, storage, requestId, attRepo } = await buildStack();
    const view = await svc.upload({
      requestId, clientId: CLIENT_A,
      fileName: 'gone.txt', contentType: 'text/plain',
      data: Buffer.from('bye'), uploadedBy: 't@t.com',
    });

    await svc.remove(view.id, CLIENT_A);

    expect(storage.delete).toHaveBeenCalledWith(view.storageKey);
    expect(await attRepo.findById(view.id, CLIENT_A)).toBeNull();
  });

  it('throws notFound when attachment belongs to a different client', async () => {
    const { svc, requestId } = await buildStack(CLIENT_A);
    const view = await svc.upload({
      requestId, clientId: CLIENT_A,
      fileName: 'x', contentType: 'text/plain',
      data: Buffer.from(''), uploadedBy: 't@t.com',
    });
    await expect(svc.remove(view.id, CLIENT_B)).rejects.toThrow(/not found/i);
  });
});
