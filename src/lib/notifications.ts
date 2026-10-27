import { and, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { items, listasDeInvitado, listFollows, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { listasAjenasSql } from '@/lib/acceso'

const TEXTOS = {
  item_baja: (t: string) => `"${t}" fue dado de baja por su dueño — te conviene elegir otro regalo.`,
  item_editado: (t: string) => `"${t}" fue editado por su dueño — revisá los detalles.`,
  regalo_encargo: (t: string) => `Ahora organizás vos el regalo grupal de "${t}" — cuando lo compres, dividí lo que salió (o cancelalo si ya no va).`,
  // también cuando el deseo ya salió de la lista ("Ya lo tengo" y el encargado lo cancela desde Cuentas): no promete que se puede reservar
  regalo_cancelado: (t: string) => `Se canceló el regalo grupal de "${t}" — si sigue en la lista y todavía querés regalarlo, podés reservarlo o armar otro.`,
  // no promete que puede volver: con el deseo fuera de la lista no puede, y si está, el deseo se lo dice
  regalo_sacado: (t: string) => `Ya no estás en el regalo grupal de "${t}": te sacó quien lo organiza — si fue un error, hablalo con esa persona.`,
  compra_corregida: (t: string) => `Quien compró el regalo grupal de "${t}" corrigió la compra y te cambió la parte — fijate en Cuentas cuánto te toca.`,
  item_baja_comprado: (t: string) => `"${t}" salió de la lista porque ya no lo quiere — si todavía podés, cambialo por otra cosa.`,
  regalo_baja: (t: string) => `"${t}" fue dado de baja por su dueño y se canceló el regalo grupal — si ya lo habían comprado, arréglenlo entre ustedes; si no, elijan otro regalo.`,
  regalo_lo_tiene: (t: string) => `"${t}" salió de la lista porque ya lo tiene — el regalo grupal sigue en Cuentas: si ya lo compraron, el que lo organiza divide lo que salió; si no, lo cancela.`,
  item_vuelve: (t: string) => `"${t}" volvió a la lista, pero tu reserva ya se había liberado — si todavía lo querés regalar, reservalo de nuevo.`,
  compra_vuelve: (t: string) => `"${t}" volvió a la lista y sigue como comprado por vos — si ya lo cambiaste, tocá "Me equivoqué, todavía no lo compré" así lo puede regalar otro.`,
  regalo_vuelve: (t: string) => `"${t}" volvió a la lista y el regalo grupal sigue como comprado — si ya lo cambiaron, cuéntenlo en el hilo del deseo.`,
} as const

/**
 * El texto del cartel de un aviso. Null si esta versión no conoce el tipo (lo escribió una más nueva y se volvió atrás el
 * deploy): ese no se muestra, en vez de tirar abajo la página donde está el botón para marcarlos como leídos.
 */
export function textoDeAviso(tipo: string, itemTitulo: string, sorpresa = false): string | null {
  // una sorpresa cancelada se va (ver cancelarRegalo): no hay deseo para reservar
  if (sorpresa && tipo === 'regalo_cancelado') return `Se canceló la sorpresa "${itemTitulo}": quien la armó la dio de baja.`
  if (sorpresa && tipo === 'item_editado') return `La sorpresa "${itemTitulo}" cambió: quien la armó la editó — revisá los detalles.`
  return Object.hasOwn(TEXTOS, tipo) ? TEXTOS[tipo as keyof typeof TEXTOS](itemTitulo) : null
}

export type TipoAviso = NonNullable<(typeof notifications.$inferInsert)['tipo']>
type Destinatario = { userId: string | null; guestId: string | null }

const clave = (d: Destinatario) => (d.userId ? `u:${d.userId}` : `g:${d.guestId}`)

/**
 * Avisos sobre un deseo para los que regalan: uno por persona, deseo y tipo. Si ya tiene uno igual sin leer (otra
 * edición del mismo deseo), ese sube arriba en vez de sumarle otro cartel idéntico.
 */
export async function dejarAviso(db: Db, itemId: string, tipo: TipoAviso, para: Destinatario[]) {
  const unicos = [...new Map(para.filter((d) => d.userId || d.guestId).map((d) => [clave(d), d])).values()]
  if (!unicos.length) return
  const userIds = unicos.flatMap((d) => (d.userId ? [d.userId] : []))
  const guestIds = unicos.flatMap((d) => (!d.userId && d.guestId ? [d.guestId] : []))
  const ya = await db.update(notifications).set({ createdAt: new Date() })
    .where(and(eq(notifications.itemId, itemId), eq(notifications.tipo, tipo), eq(notifications.leida, false), or(
      userIds.length ? inArray(notifications.userId, userIds) : undefined,
      guestIds.length ? inArray(notifications.guestId, guestIds) : undefined,
    )))
    .returning({ userId: notifications.userId, guestId: notifications.guestId })
  const tienen = new Set(ya.map(clave))
  const nuevos = unicos.filter((d) => !tienen.has(clave(d)))
  if (nuevos.length) {
    await db.insert(notifications).values(nuevos.map((d) => ({ userId: d.userId, guestId: d.userId ? null : d.guestId, tipo, itemId })))
  }
}

function notifDe(viewer: Viewer) {
  return viewer.userId
    ? eq(notifications.userId, viewer.userId)
    : eq(notifications.guestId, viewer.guestId!)
}

/**
 * Si el que mira tiene el link para regalar de ahora (en una consulta con lists): nunca lo cambiaron, o abrió la lista
 * después del cambio (la sigue, o un invitado se anotó ahí después). Si no, un cartel no se lo pasa: puede ser justo a
 * quien se lo quisieron sacar (ver cambiarLinkParaRegalar).
 */
function tieneElLinkSql(db: Db, viewer: Viewer) {
  const despues = viewer.userId
    ? inArray(lists.id, db.select({ id: listFollows.listId }).from(listFollows).where(eq(listFollows.userId, viewer.userId)))
    : inArray(lists.id, db.select({ id: listasDeInvitado.listId }).from(listasDeInvitado)
      .where(and(eq(listasDeInvitado.guestId, viewer.guestId!), gt(listasDeInvitado.createdAt, lists.shareTokenAt))))
  return or(isNull(lists.shareTokenAt), despues)
}

const A_CUENTAS = new Set<string>(['regalo_lo_tiene', 'compra_corregida'])

/**
 * Los avisos sobre deseos del que mira: los sin leer (los carteles) o, con desde, todos los de entonces para acá (la
 * bandeja), los más nuevos primero.
 */
export async function avisosDeDeseos(db: Db, viewer: Viewer, { desde }: { desde?: Date } = {}) {
  if (!viewer.userId && !viewer.guestId) return []
  const filas = await db.select({
    id: notifications.id, tipo: notifications.tipo, itemTitulo: items.titulo, itemId: items.id, token: lists.shareToken,
    leida: notifications.leida, createdAt: notifications.createdAt,
    activo: sql<boolean>`${items.estadoDueno} = 'activo'`, conLink: sql<boolean>`${tieneElLinkSql(db, viewer)}`, tipoLista: lists.tipo,
  }).from(notifications).innerJoin(items, eq(notifications.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id))
    // un aviso sobre un deseo propio le diría al dueño que alguien lo reservó
    .where(and(desde ? gte(notifications.createdAt, desde) : eq(notifications.leida, false), notifDe(viewer), listasAjenasSql(db, viewer)))
    .orderBy(desc(notifications.createdAt))
  return filas.map(({ itemId, token, activo, conLink, tipoLista, ...n }) => ({
    ...n,
    sorpresa: tipoLista === 'sorpresa',
    // al deseo (qué cambió, el regalo para dividir); si ya no está en la lista, a la lista, para elegir otro. El regalo
    // grupal de uno que ya lo tiene se termina en Cuentas (sin pasar el link de la lista), y una parte corregida se ve ahí.
    // El encargo de un regalo cuyo deseo ya no se abre (salió de la lista, o no tiene el link) también: se divide o se
    // cancela desde Cuentas, como el recordatorio (ver regalosParaCerrar)
    href: A_CUENTAS.has(n.tipo) || (n.tipo === 'regalo_encargo' && !(activo && conLink)) ? '/cuentas'
      : !conLink ? null : tipoLista === 'sorpresa' ? `/sorpresa/${token}` : activo ? `/l/${token}/item/${itemId}` : `/l/${token}`,
  }))
}

export async function getUnreadNotifications(db: Db, viewer: Viewer) {
  return (await avisosDeDeseos(db, viewer)).map((n) => ({ id: n.id, tipo: n.tipo, itemTitulo: n.itemTitulo, sorpresa: n.sorpresa, href: n.href }))
}

/** Marca leídos los avisos sobre deseos del que mira (con hasta, los de hasta ese momento: los que vio en la bandeja). */
export async function markNotificationsRead(db: Db, viewer: Viewer, hasta?: Date) {
  if (!viewer.userId && !viewer.guestId) return
  // solo los que se mostraron: los que se esconden en este navegador (ver listasAjenasSql) quedan sin leer
  const ajenas = listasAjenasSql(db, viewer)
  const visibles = ajenas && inArray(notifications.itemId,
    db.select({ id: items.id }).from(items).innerJoin(lists, eq(items.listId, lists.id)).where(ajenas))
  await db.update(notifications).set({ leida: true })
    .where(and(notifDe(viewer), visibles, hasta && lte(notifications.createdAt, hasta)))
}
