/**
 * El test de oro (spec, "Regla de la sorpresa"): el dueño no puede obtener
 * el estado de sus propios items por NINGÚN endpoint, incluso pidiendo
 * claims/comments por ID directo con el link compartido.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Claim, Comment, Item, List } from '../src/domain/types.js';

const NOW = Date.now();

const list: List = {
  listId: 'l1',
  ownerId: 'owner1',
  shareToken: 'tok123',
  createdAt: new Date(NOW).toISOString(),
};

const item: Item = {
  itemId: 'i1',
  listId: 'l1',
  ownerId: 'owner1',
  tipo: 'exacto',
  titulo: 'Auriculares',
  prioridad: 'gustaria',
  cantidad: 1,
  repetible: false,
  estadoDueno: 'activo',
  claimCount: 1,
  createdAt: new Date(NOW).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
};

const claim: Claim = {
  claimId: 'c1',
  itemId: 'i1',
  listId: 'l1',
  claimerKey: 'user#tia',
  claimerNombre: 'Tía Marta',
  estado: 'reservado',
  expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
  createdAt: new Date(NOW).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
};

const comment: Comment = {
  commentId: 'cm1',
  itemId: 'i1',
  authorKey: 'user#tia',
  authorNombre: 'Tía Marta',
  texto: 'yo le sumo la funda',
  createdAt: new Date(NOW).toISOString(),
};

vi.mock('../src/store/dynamo.js', () => ({
  ConflictError: class ConflictError extends Error {},
  getListByToken: vi.fn(async (t: string) => (t === 'tok123' ? list : null)),
  getItems: vi.fn(async () => [item]),
  getItem: vi.fn(async (_l: string, id: string) => (id === 'i1' ? item : null)),
  getClaims: vi.fn(async () => [claim]),
  getClaim: vi.fn(async (_i: string, id: string) => (id === 'c1' ? claim : null)),
  getComments: vi.fn(async () => [comment]),
  getUserNombre: vi.fn(async () => 'Rodri'),
  getGuest: vi.fn(async () => null),
  expireClaims: vi.fn(async () => {}),
  executeReserve: vi.fn(async () => {}),
  executeClaimTransition: vi.fn(async () => {}),
  putComment: vi.fn(async () => {}),
  createGuest: vi.fn(),
  getNotifications: vi.fn(async () => []),
}));

const { handler } = await import('../src/handlers/public.js');
const store = await import('../src/store/dynamo.js');

function event(routeKey: string, opts: { sub?: string; params?: Record<string, string>; body?: unknown } = {}) {
  return {
    routeKey,
    headers: {},
    pathParameters: { token: 'tok123', ...opts.params },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    isBase64Encoded: false,
    requestContext: opts.sub
      ? { authorizer: { jwt: { claims: { sub: opts.sub, name: 'Alguien' } } } }
      : {},
  } as never;
}

function parse(res: unknown): { statusCode: number; body: Record<string, unknown> } {
  const r = res as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) };
}

describe('el dueño es ciego por cualquier vía', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /l/{token} con el JWT del dueño devuelve la vista dueño sin rastro de actividad', async () => {
    const { statusCode, body } = parse(await handler(event('GET /l/{token}', { sub: 'owner1' })));
    expect(statusCode).toBe(200);
    expect(body.vista).toBe('dueno');
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('reservado');
    expect(raw).not.toContain('Tía Marta');
    expect(raw).not.toContain('claim');
    expect(raw).not.toContain('comment');
  });

  it('GET detalle por ID directo → 404 para el dueño', async () => {
    const res = parse(
      await handler(event('GET /l/{token}/items/{itemId}', { sub: 'owner1', params: { itemId: 'i1' } })),
    );
    expect(res.statusCode).toBe(404);
  });

  it('reservar su propio item → 404 (ni confirmación de que existía cupo)', async () => {
    const res = parse(
      await handler(
        event('POST /l/{token}/items/{itemId}/claims', { sub: 'owner1', params: { itemId: 'i1' } }),
      ),
    );
    expect(res.statusCode).toBe(404);
    expect(store.executeReserve).not.toHaveBeenCalled();
  });

  it('la capa de comentarios no se abre ni por URL directa → 404', async () => {
    const res = parse(
      await handler(
        event('POST /l/{token}/items/{itemId}/comments', {
          sub: 'owner1',
          params: { itemId: 'i1' },
          body: { texto: 'hola?' },
        }),
      ),
    );
    expect(res.statusCode).toBe(404);
    expect(store.putComment).not.toHaveBeenCalled();
  });
});

describe('los regaladores ven todo', () => {
  it('otro usuario ve estados, nombres y comentarios', async () => {
    const res = parse(
      await handler(event('GET /l/{token}/items/{itemId}', { sub: 'tia', params: { itemId: 'i1' } })),
    );
    expect(res.statusCode).toBe(200);
    const itemView = res.body.item as { estado: string; claims: unknown[]; comments: unknown[] };
    expect(itemView.estado).toBe('reservado');
    expect(itemView.claims).toHaveLength(1);
    expect(itemView.comments).toHaveLength(1);
  });

  it('un visitante anónimo ve la lista en modo regalador, pero no puede reservar sin identidad', async () => {
    const vista = parse(await handler(event('GET /l/{token}')));
    expect(vista.body.vista).toBe('regalador');
    const reserva = parse(
      await handler(event('POST /l/{token}/items/{itemId}/claims', { params: { itemId: 'i1' } })),
    );
    expect(reserva.statusCode).toBe(401);
  });
});
