import { describe, expect, it } from 'vitest';
import {
  applyExpiration,
  findExpired,
  planClaimerNotifications,
  planPurchase,
  planRelease,
  planReserve,
} from '../src/domain/claims.js';
import type { Claim, Item, Viewer } from '../src/domain/types.js';

const NOW = new Date('2026-08-16T12:00:00Z');

function item(overrides: Partial<Item> = {}): Item {
  return {
    itemId: 'i1',
    listId: 'l1',
    ownerId: 'owner1',
    tipo: 'exacto',
    titulo: 'Mate de algarrobo',
    prioridad: 'mucho',
    cantidad: 1,
    repetible: false,
    estadoDueno: 'activo',
    claimCount: 0,
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
    expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const tia: Viewer = { kind: 'user', id: 'tia', nombre: 'Tía Marta' };
const abuela: Viewer = { kind: 'guest', id: 'g1', nombre: 'Abuela' };
const dueno: Viewer = { kind: 'user', id: 'owner1', nombre: 'Dueño' };

describe('planReserve', () => {
  it('prohíbe el auto-regalo', () => {
    const plan = planReserve(item(), dueno, NOW, 'c-new');
    expect(plan).toEqual({ ok: false, error: 'auto_regalo_prohibido' });
  });

  it('exige identidad', () => {
    expect(planReserve(item(), null, NOW, 'c-new')).toEqual({
      ok: false,
      error: 'identidad_requerida',
    });
  });

  it('rechaza items archivados', () => {
    expect(planReserve(item({ estadoDueno: 'lo_tengo' }), tia, NOW, 'c-new')).toEqual({
      ok: false,
      error: 'item_archivado',
    });
  });

  it('rechaza cuando el cupo está lleno', () => {
    expect(planReserve(item({ claimCount: 1 }), tia, NOW, 'c-new')).toEqual({
      ok: false,
      error: 'item_no_disponible',
    });
  });

  it('reserva con expiración a 14 días y condición de cupo atómica', () => {
    const plan = planReserve(item(), tia, NOW, 'c-new');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.itemCondition).toBe('cupo_y_activo');
    expect(plan.value.claim.expiresAt).toBe('2026-08-30T12:00:00.000Z');
    expect(plan.value.claim.claimerKey).toBe('user#tia');
  });

  it('los guests reservan igual que los usuarios', () => {
    const plan = planReserve(item(), abuela, NOW, 'c-new');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.value.claim.claimerKey).toBe('guest#g1');
  });

  it('idea repetible: sin condición de cupo, claims en paralelo', () => {
    const repetible = item({ tipo: 'idea', repetible: true, claimCount: 5, cantidad: 1 });
    const plan = planReserve(repetible, tia, NOW, 'c-new');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.value.itemCondition).toBe('solo_activo');
  });

  it('cantidad > 1 admite claims hasta el cupo', () => {
    const doble = item({ cantidad: 2, claimCount: 1 });
    expect(planReserve(doble, tia, NOW, 'c-new').ok).toBe(true);
    expect(planReserve(item({ cantidad: 2, claimCount: 2 }), tia, NOW, 'c-new').ok).toBe(false);
  });
});

describe('planPurchase / planRelease', () => {
  it('solo el claimer puede transicionar su claim', () => {
    expect(planPurchase(claim(), abuela, NOW)).toEqual({ ok: false, error: 'claim_ajeno' });
  });

  it('rechaza claims vencidos', () => {
    const vencido = claim({ expiresAt: new Date(NOW.getTime() - 1000).toISOString() });
    expect(planPurchase(vencido, tia, NOW)).toEqual({ ok: false, error: 'claim_no_activo' });
  });

  it('comprar mantiene el cupo ocupado; liberar lo devuelve', () => {
    const compra = planPurchase(claim(), tia, NOW, 'compré el de 1L');
    expect(compra.ok && !compra.value.decrementaContador).toBe(true);
    if (compra.ok) expect(compra.value.notaQueCompre).toBe('compré el de 1L');
    const liberacion = planRelease(claim(), tia, NOW);
    expect(liberacion.ok && liberacion.value.decrementaContador).toBe(true);
  });
});

describe('expiración lazy', () => {
  it('detecta solo reservas vencidas', () => {
    const vencido = claim({ claimId: 'v', expiresAt: new Date(NOW.getTime() - 1).toISOString() });
    const vigente = claim({ claimId: 'ok' });
    const comprado = claim({ claimId: 'comp', estado: 'comprado', expiresAt: undefined });
    expect(findExpired([vencido, vigente, comprado], NOW).map((c) => c.claimId)).toEqual(['v']);
  });

  it('applyExpiration marca en memoria sin tocar el resto', () => {
    const vencido = claim({ claimId: 'v', expiresAt: new Date(NOW.getTime() - 1).toISOString() });
    const result = applyExpiration([vencido, claim({ claimId: 'ok' })], NOW);
    expect(result.find((c) => c.claimId === 'v')?.estado).toBe('expirado');
    expect(result.find((c) => c.claimId === 'ok')?.estado).toBe('reservado');
  });
});

describe('notificaciones a claimers (edición / archivado)', () => {
  it('notifica una vez por claimer activo, nunca al dueño', () => {
    const claims = [
      claim({ claimId: 'a', claimerKey: 'user#tia' }),
      claim({ claimId: 'b', claimerKey: 'user#tia', estado: 'comprado' }),
      claim({ claimId: 'c', claimerKey: 'guest#g1' }),
      claim({ claimId: 'd', claimerKey: 'user#primo', estado: 'liberado' }),
      claim({
        claimId: 'e',
        claimerKey: 'user#otra',
        expiresAt: new Date(NOW.getTime() - 1).toISOString(),
      }),
    ];
    const notifs = planClaimerNotifications(item(), claims, 'item_archivado', NOW, (k) => `n-${k}`);
    expect(notifs.map((n) => n.recipientKey).sort()).toEqual(['guest#g1', 'user#tia']);
    expect(notifs.every((n) => n.tipo === 'item_archivado' && !n.leida)).toBe(true);
  });
});
