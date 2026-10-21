import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import webpush from 'web-push'
import { codazos, config, lists, pushSubs } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { duenosDeLista, esDuenoSql, esToken } from '@/lib/groups'

// Codazo: quien regala le pide al dueño que cargue su lista. Le llega como aviso push (si lo activó)
// y como cartel en Mi lista. No dice nada de reservas: solo quién le dio el codazo.

export const CODAZO_CADA_HORAS = 24
/** Tope por lista y por día, por si muchos tocan a la vez. */
export const CODAZOS_POR_DIA = 5

/** Claves VAPID: se generan solas la primera vez y quedan en la base (nadie maneja la privada). */
export async function clavesVapid(db: Db): Promise<{ publica: string; privada: string }> {
  const leer = async () => Object.fromEntries((await db.select().from(config)
    .where(inArray(config.clave, ['vapid_publica', 'vapid_privada']))).map((c) => [c.clave, c.valor]))
  let c = await leer()
  if (!c.vapid_publica || !c.vapid_privada) {
    const k = webpush.generateVAPIDKeys()
    // si dos pedidos llegan juntos, gana el primero y los dos leen el mismo par
    await db.insert(config).values([{ clave: 'vapid_publica', valor: k.publicKey }, { clave: 'vapid_privada', valor: k.privateKey }]).onConflictDoNothing()
    c = await leer()
  }
  return { publica: c.vapid_publica, privada: c.vapid_privada }
}

export type SuscripcionPush = { endpoint: string; keys: { p256dh: string; auth: string } }

const esSuscripcion = (s: unknown): s is SuscripcionPush => {
  const x = s as SuscripcionPush
  return !!x && typeof x.endpoint === 'string' && x.endpoint.startsWith('https://') && x.endpoint.length < 1000 &&
    typeof x.keys?.p256dh === 'string' && typeof x.keys?.auth === 'string' && x.keys.p256dh.length < 200 && x.keys.auth.length < 100
}

/** Activa los avisos en este dispositivo (si el endpoint ya existía, pasa a ser de este usuario). */
export async function guardarSuscripcion(db: Db, userId: string, s: unknown): Promise<boolean> {
  if (!esSuscripcion(s)) return false
  await db.insert(pushSubs).values({ userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth })
    .onConflictDoUpdate({ target: pushSubs.endpoint, set: { userId, p256dh: s.keys.p256dh, auth: s.keys.auth } })
  return true
}

export async function borrarSuscripcion(db: Db, userId: string, endpoint: string) {
  await db.delete(pushSubs).where(and(eq(pushSubs.userId, userId), eq(pushSubs.endpoint, endpoint)))
}

export async function tieneAvisos(db: Db, userId: string): Promise<boolean> {
  const [s] = await db.select({ id: pushSubs.id }).from(pushSubs).where(eq(pushSubs.userId, userId)).limit(1)
  return !!s
}

export type Aviso = { title: string; body: string; url: string }
/** Cómo se manda un aviso (en los tests se reemplaza). Devuelve el status HTTP del servicio de push. */
export type Enviar = (s: SuscripcionPush, aviso: Aviso, vapid: { publica: string; privada: string }) => Promise<number>

const enviarConWebPush: Enviar = async (s, aviso, vapid) => {
  const asunto = process.env.NEXT_PUBLIC_BASE_URL?.startsWith('https://') ? process.env.NEXT_PUBLIC_BASE_URL : 'mailto:avisos@giftr.app'
  try {
    const r = await webpush.sendNotification(s, JSON.stringify(aviso), {
      vapidDetails: { subject: asunto, publicKey: vapid.publica, privateKey: vapid.privada }, TTL: 60 * 60 * 24, timeout: 5000,
    })
    return r.statusCode
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 0
  }
}

/** Manda un aviso a todos los dispositivos del usuario. Borra los que ya no existen (404/410). Devuelve a cuántos llegó. */
export async function avisar(db: Db, userId: string, aviso: Aviso, enviar: Enviar = enviarConWebPush): Promise<number> {
  const subs = await db.select().from(pushSubs).where(eq(pushSubs.userId, userId))
  if (!subs.length) return 0
  const vapid = await clavesVapid(db)
  let llegaron = 0
  for (const s of subs) {
    const status = await enviar({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, aviso, vapid)
    if (status >= 200 && status < 300) llegaron++
    else if (status === 404 || status === 410) await db.delete(pushSubs).where(eq(pushSubs.id, s.id))
  }
  return llegaron
}

export type CodazoResult =
  | { ok: true; para: string[]; avisados: number }
  | { ok: false; reason: 'no_existe' | 'propio' | 'sin_identidad' | 'ya_mandaste' | 'muchos' }

/**
 * El codazo: uno por persona y lista cada 24 h (y como mucho 5 por lista por día).
 * Le llega a cada dueño de la lista como aviso push y queda como cartel hasta que lo ve.
 */
export async function mandarCodazo(db: Db, token: string, viewer: Viewer, deNombre: string, enviar: Enviar = enviarConWebPush): Promise<CodazoResult> {
  if (!viewer.userId && !viewer.guestId) return { ok: false, reason: 'sin_identidad' }
  if (!esToken(token)) return { ok: false, reason: 'no_existe' }
  const [list] = await db.select().from(lists).where(eq(lists.shareToken, token))
  if (!list) return { ok: false, reason: 'no_existe' }
  const duenos = await duenosDeLista(db, list)
  if (viewer.userId && duenos.some((d) => d.id === viewer.userId)) return { ok: false, reason: 'propio' }

  const desde = new Date(Date.now() - CODAZO_CADA_HORAS * 3600_000)
  const deEste = viewer.userId ? eq(codazos.deUserId, viewer.userId) : eq(codazos.deGuestId, viewer.guestId!)
  const [{ mios }] = await db.select({ mios: sql<number>`count(*)::int` }).from(codazos)
    .where(and(eq(codazos.listId, list.id), deEste, gt(codazos.createdAt, desde)))
  if (mios > 0) return { ok: false, reason: 'ya_mandaste' }
  const [{ todos }] = await db.select({ todos: sql<number>`count(distinct coalesce(${codazos.deUserId}, ${codazos.deGuestId}))::int` }).from(codazos)
    .where(and(eq(codazos.listId, list.id), gt(codazos.createdAt, desde)))
  if (todos >= CODAZOS_POR_DIA) return { ok: false, reason: 'muchos' }

  await db.insert(codazos).values(duenos.map((d) => ({
    listId: list.id, paraUserId: d.id, deUserId: viewer.userId ?? null, deGuestId: viewer.guestId ?? null, deNombre,
  })))
  const primer = deNombre.split(' ')[0]
  let avisados = 0
  for (const d of duenos) {
    avisados += await avisar(db, d.id, {
      title: `👉 ¡Codazo de ${primer}!`,
      body: list.tipo === 'grupo'
        ? `Quiere saber qué regalarles. Cargá cosas en "${list.nombre ?? 'el grupo'}".`
        : 'Quiere saber qué regalarte. Cargá lo que querés en tu lista.',
      url: list.tipo === 'grupo' ? `/grupos/${list.id}` : '/mi-lista',
    }, enviar)
  }
  return { ok: true, para: duenos.map((d) => d.nombre), avisados }
}

/** Los codazos que el usuario todavía no vio (para el cartel en Mi lista y en sus grupos). Los de un grupo del que salió, no. */
export async function codazosSinVer(db: Db, userId: string) {
  return db.select({ id: codazos.id, deNombre: codazos.deNombre, listId: codazos.listId, tipo: lists.tipo, listaNombre: lists.nombre, createdAt: codazos.createdAt })
    .from(codazos).innerJoin(lists, eq(codazos.listId, lists.id))
    .where(and(eq(codazos.paraUserId, userId), eq(codazos.visto, false), esDuenoSql(db, userId)))
    .orderBy(desc(codazos.createdAt))
}

export async function marcarCodazosVistos(db: Db, userId: string) {
  await db.update(codazos).set({ visto: true }).where(and(eq(codazos.paraUserId, userId), eq(codazos.visto, false)))
}
