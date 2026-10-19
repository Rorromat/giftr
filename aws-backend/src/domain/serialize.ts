/**
 * Regla de la sorpresa — único punto de serialización de items.
 *
 * Si el que pide es dueño del item, la respuesta se arma por ALLOWLIST:
 * sin claims, sin comments, sin claimCount ni ningún campo derivado de
 * actividad. Ningún handler puede devolver items sin pasar por acá.
 */
import {
  Claim,
  Comment,
  Item,
  Viewer,
  claimActivo,
  claimVencido,
  viewerKey,
} from './types.js';

export interface OwnerItemView {
  itemId: string;
  tipo: Item['tipo'];
  titulo: string;
  descripcion?: string;
  fotoUrl?: string;
  precio?: string;
  rangoPrecio?: string;
  categoria?: string;
  prioridad: Item['prioridad'];
  cantidad: number;
  repetible: boolean;
  estadoDueno: Item['estadoDueno'];
  linkTienda?: string;
  createdAt: string;
}

export type EstadoRegalador = 'disponible' | 'reservado' | 'comprado';

export interface GiverClaimView {
  claimId: string;
  claimerNombre: string;
  esMio: boolean;
  estado: 'reservado' | 'comprado';
  expiresAt?: string;
  /** Días restantes de la reserva; a mitad de plazo el cliente muestra el banner. */
  diasRestantes?: number;
  notaQueCompre?: string;
}

export interface GiverCommentView {
  commentId: string;
  authorNombre: string;
  esMio: boolean;
  texto: string;
  createdAt: string;
}

export interface GiverItemView extends OwnerItemView {
  estado: EstadoRegalador;
  claims: GiverClaimView[];
  comments: GiverCommentView[];
}

export function esDueno(item: Pick<Item, 'ownerId'>, viewer: Viewer | null): boolean {
  return viewer?.kind === 'user' && viewer.id === item.ownerId;
}

function baseView(item: Item): OwnerItemView {
  return {
    itemId: item.itemId,
    tipo: item.tipo,
    titulo: item.titulo,
    descripcion: item.descripcion,
    fotoUrl: item.fotoUrl,
    precio: item.precio,
    rangoPrecio: item.rangoPrecio,
    categoria: item.categoria,
    prioridad: item.prioridad,
    cantidad: item.cantidad,
    repetible: item.repetible,
    estadoDueno: item.estadoDueno,
    linkTienda: item.linkTienda,
    createdAt: item.createdAt,
  };
}

/** Vista dueño: allowlist estricta, cero señales de actividad. */
export function serializeForOwner(item: Item): OwnerItemView {
  return baseView(item);
}

/** Estado agregado que ven los regaladores (el dueño jamás). */
export function estadoRegalador(item: Item, claims: Claim[], now: Date): EstadoRegalador {
  const compras = claims.filter((c) => c.estado === 'comprado').length;
  if (!item.repetible && compras >= item.cantidad) return 'comprado';
  if (item.repetible) return 'disponible';
  const activos = claims.filter((c) => claimActivo(c, now)).length;
  return activos >= item.cantidad ? 'reservado' : 'disponible';
}

export function serializeForGiver(
  item: Item,
  claims: Claim[],
  comments: Comment[],
  viewer: Viewer | null,
  now: Date,
): GiverItemView {
  const vk = viewer ? viewerKey(viewer) : null;
  const visibles = claims.filter((c) => claimActivo(c, now) && !claimVencido(c, now));
  return {
    ...baseView(item),
    estado: estadoRegalador(item, claims, now),
    claims: visibles.map((c) => ({
      claimId: c.claimId,
      claimerNombre: c.claimerNombre,
      esMio: c.claimerKey === vk,
      estado: c.estado as 'reservado' | 'comprado',
      expiresAt: c.estado === 'reservado' ? c.expiresAt : undefined,
      diasRestantes:
        c.estado === 'reservado' && c.expiresAt
          ? Math.max(0, Math.ceil((new Date(c.expiresAt).getTime() - now.getTime()) / 86_400_000))
          : undefined,
      notaQueCompre: c.notaQueCompre,
    })),
    comments: comments.map((c) => ({
      commentId: c.commentId,
      authorNombre: c.authorNombre,
      esMio: c.authorKey === vk,
      texto: c.texto,
      createdAt: c.createdAt,
    })),
  };
}

/**
 * Punto de entrada único: decide la vista según identidad.
 * El dueño recibe la vista ciega aunque pida por el link compartido.
 */
export function serializeItem(
  item: Item,
  claims: Claim[],
  comments: Comment[],
  viewer: Viewer | null,
  now: Date,
): OwnerItemView | GiverItemView {
  if (esDueno(item, viewer)) return serializeForOwner(item);
  return serializeForGiver(item, claims, comments, viewer, now);
}
