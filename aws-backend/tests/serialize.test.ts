import { describe, expect, it } from 'vitest';
import {
  estadoRegalador,
  serializeForGiver,
  serializeItem,
} from '../src/domain/serialize.js';
import type { Claim, Comment, Item, Viewer } from '../src/domain/types.js';

const NOW = new Date('2026-08-16T12:00:00Z');
const FUTURO = new Date(NOW.getTime() + 7 * 86_400_000).toISOString();

function item(overrides: Partial<Item> = {}): Item {
  return {
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
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    claimId: 'c1',
    itemId: 'i1',
    listId: 'l1',
    claimerKey: 'user#tia',
    claimerNombre: 'Tía Marta',
    estado: 'reservado',
    expiresAt: FUTURO,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const comment: Comment = {
  commentId: 'cm1',
  itemId: 'i1',
  authorKey: 'user#tia',
  authorNombre: 'Tía Marta',
  texto: '🤫 yo le sumo la funda',
  createdAt: NOW.toISOString(),
};

const dueno: Viewer = { kind: 'user', id: 'owner1', nombre: 'Dueño' };
const tia: Viewer = { kind: 'user', id: 'tia', nombre: 'Tía Marta' };

describe('regla de la sorpresa — serialización', () => {
  it('el dueño recibe la vista ciega: sin claims, comments, contadores ni estado', () => {
    const view = serializeItem(item(), [claim()], [comment], dueno, NOW);
    const raw = JSON.stringify(view);
    expect(raw).not.toContain('claim');
    expect(raw).not.toContain('comment');
    expect(raw).not.toContain('reservado');
    expect(raw).not.toContain('Tía Marta');
    expect(view).not.toHaveProperty('claims');
    expect(view).not.toHaveProperty('comments');
    expect(view).not.toHaveProperty('estado');
    expect(view).not.toHaveProperty('claimCount');
  });

  it('el dueño recibe vista ciega incluso pidiendo por el link compartido (decide identidad, no URL)', () => {
    const view = serializeItem(item(), [claim({ estado: 'comprado' })], [], dueno, NOW);
    expect(view).not.toHaveProperty('estado');
  });

  it('un regalador ve estados, quién reservó y los comentarios ocultos', () => {
    const view = serializeForGiver(item(), [claim()], [comment], tia, NOW);
    expect(view.estado).toBe('reservado');
    expect(view.claims[0]?.claimerNombre).toBe('Tía Marta');
    expect(view.claims[0]?.esMio).toBe(true);
    expect(view.claims[0]?.diasRestantes).toBe(7);
    expect(view.comments[0]?.texto).toContain('funda');
  });

  it('un visitante anónimo (link sin identidad) también ve la capa regalador', () => {
    const view = serializeForGiver(item(), [claim()], [comment], null, NOW);
    expect(view.estado).toBe('reservado');
    expect(view.claims[0]?.esMio).toBe(false);
  });

  it('las reservas vencidas no aparecen ni bloquean', () => {
    const vencido = claim({ expiresAt: new Date(NOW.getTime() - 1).toISOString() });
    const view = serializeForGiver(item(), [vencido], [], tia, NOW);
    expect(view.estado).toBe('disponible');
    expect(view.claims).toHaveLength(0);
  });
});

describe('estado agregado para regaladores', () => {
  it('cantidad > 1: comprado recién con N compras', () => {
    const doble = item({ cantidad: 2, claimCount: 2 });
    const compras1 = [claim({ estado: 'comprado', expiresAt: undefined }), claim({ claimId: 'c2' })];
    expect(estadoRegalador(doble, compras1, NOW)).toBe('reservado');
    const compras2 = [
      claim({ estado: 'comprado', expiresAt: undefined }),
      claim({ claimId: 'c2', estado: 'comprado', expiresAt: undefined }),
    ];
    expect(estadoRegalador(doble, compras2, NOW)).toBe('comprado');
    expect(estadoRegalador(item({ cantidad: 2 }), [claim()], NOW)).toBe('disponible');
  });

  it('idea repetible: siempre disponible aunque tenga compras', () => {
    const repetible = item({ tipo: 'idea', repetible: true });
    const claims = [claim({ estado: 'comprado', expiresAt: undefined }), claim({ claimId: 'c2' })];
    expect(estadoRegalador(repetible, claims, NOW)).toBe('disponible');
  });
});
