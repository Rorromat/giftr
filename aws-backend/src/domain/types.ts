export type ItemTipo = 'exacto' | 'idea';
export type Prioridad = 'mucho' | 'gustaria' | 'suelta';
export type EstadoDueno = 'activo' | 'lo_tengo' | 'no_lo_quiero';
export type ClaimEstado = 'reservado' | 'comprado' | 'liberado' | 'expirado';

/** Identidad del que mira/actúa: usuario Cognito o guest por link. */
export interface Viewer {
  kind: 'user' | 'guest';
  id: string;
  nombre?: string;
}

export function viewerKey(v: Viewer): string {
  return `${v.kind}#${v.id}`;
}

export interface List {
  listId: string;
  ownerId: string; // sub de Cognito
  shareToken: string;
  createdAt: string;
}

export interface Item {
  itemId: string;
  listId: string;
  ownerId: string;
  tipo: ItemTipo;
  titulo: string;
  descripcion?: string;
  fotoUrl?: string;
  precio?: string; // texto libre con símbolo (concepto §10.5)
  rangoPrecio?: string; // solo tipo idea
  categoria?: string;
  prioridad: Prioridad;
  cantidad: number; // default 1
  repetible: boolean; // solo tipo idea
  estadoDueno: EstadoDueno;
  linkTienda?: string;
  /** Reservas activas + compras. NUNCA se serializa hacia el dueño. */
  claimCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Claim {
  claimId: string;
  itemId: string;
  listId: string;
  /** viewerKey del claimer, ej. "user#abc" o "guest#xyz" */
  claimerKey: string;
  claimerNombre: string;
  estado: ClaimEstado;
  expiresAt?: string; // solo mientras estado = reservado
  notaQueCompre?: string; // solo entre regaladores
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  commentId: string;
  itemId: string;
  authorKey: string;
  authorNombre: string;
  texto: string;
  createdAt: string;
}

export interface GuestIdentity {
  guestId: string;
  secret: string;
  nombre: string;
  email?: string;
  promotedToUserId?: string;
  createdAt: string;
}

export type NotificationTipo =
  | 'item_editado'
  | 'item_archivado'
  | 'reserva_por_vencer';

export interface Notification {
  notifId: string;
  recipientKey: string;
  tipo: NotificationTipo;
  itemId: string;
  itemTitulo: string;
  leida: boolean;
  createdAt: string;
}

export const RESERVA_DIAS = 14;

export function claimActivo(c: Claim, now: Date): boolean {
  if (c.estado === 'comprado') return true;
  if (c.estado !== 'reservado') return false;
  return !claimVencido(c, now);
}

export function claimVencido(c: Claim, now: Date): boolean {
  return (
    c.estado === 'reservado' &&
    c.expiresAt !== undefined &&
    new Date(c.expiresAt).getTime() <= now.getTime()
  );
}
