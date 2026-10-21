import { and, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import { parse as parseUrl } from 'node:url'
import webpush from 'web-push'
import { codazos, config, lists, pushSubs, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { duenosDeLista, esDuenoSql, esToken } from '@/lib/groups'

// Codazo: quien regala le pide al dueño que cargue su lista. Le llega como aviso push (si lo activó)
// y como cartel en Mi lista. No dice nada de reservas: solo quién le dio el codazo.

export const CODAZO_CADA_HORAS = 24
/** Tope por lista y por día, por si muchos tocan a la vez. */
export const CODAZOS_POR_DIA = 5
/**
 * De esos, cuántos pueden ser de invitados: cada navegador sin cookie (el de WhatsApp, el de Instagram, una pestaña
 * privada) es un invitado nuevo, y una sola persona les sacaba el lugar a todos. Así, a los que tienen cuenta les quedan 3.
 */
export const CODAZOS_DE_INVITADOS_POR_DIA = 2

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

/** Cuántos dispositivos con avisos puede tener alguien: al activar otro más, se va el más viejo. */
export const SUSCRIPCIONES_POR_USUARIO = 10

/**
 * Los servicios de push de los navegadores (Chrome, Edge nuevo, Samsung y Opera: FCM; Firefox: Mozilla; Safari: Apple;
 * Edge viejo: Windows). Mandar un aviso es un POST desde el servidor: a cualquier otro host sería mandarle pedidos a quien
 * se le ocurra al que activa los avisos (otro sitio, o la red interna).
 */
const SERVICIOS_PUSH = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com']
const esServicioPush = (host: string) => SERVICIOS_PUSH.some((s) => host === s || host.endsWith(`.${s}`))

const base64url = (s: string) => (/^[A-Za-z0-9_-]+={0,2}$/.test(s) ? Buffer.from(s, 'base64url') : null)

/**
 * Una suscripción que se puede usar: https a un servicio de push conocido (sin puerto ni usuario) y las claves como las
 * pide web-push (la pública del navegador, P-256 sin comprimir, de 65 bytes, y el secreto de 16). Con claves basura
 * web-push falla antes de mandar y la fila no se borraba nunca.
 * El host se mira en el texto tal cual se guarda, no solo en el que arma new URL: web-push lo vuelve a leer con url.parse,
 * y con un "%2E" en el host ("localhost%2Efcm.googleapis.com") cada uno veía otro, así que pasaba el control y el POST iba
 * a localhost. El navegador da el endpoint ya normalizado: si new URL lo cambia (un %2E, mayúsculas, un carácter de
 * control), no es uno de verdad.
 */
export function esSuscripcion(s: unknown): s is SuscripcionPush {
  const x = s as SuscripcionPush
  if (!x || typeof x.endpoint !== 'string' || x.endpoint.length >= 1000) return false
  if (typeof x.keys?.p256dh !== 'string' || typeof x.keys?.auth !== 'string' || x.keys.p256dh.length > 200 || x.keys.auth.length > 100) return false
  let u: URL
  try { u = new URL(x.endpoint) } catch { return false }
  if (u.href !== x.endpoint || u.protocol !== 'https:' || u.port || u.username || u.password || !esServicioPush(u.hostname)) return false
  // el host escrito con letras, números, guiones y puntos, y el mismo para el parser con el que web-push se conecta
  if (x.endpoint.match(/^https:\/\/([a-z0-9.-]+)\//)?.[1] !== u.hostname || parseUrl(x.endpoint).hostname !== u.hostname) return false
  const [p256dh, auth] = [base64url(x.keys.p256dh), base64url(x.keys.auth)]
  return p256dh?.length === 65 && p256dh[0] === 4 && !!auth && auth.length >= 16
}

/** Deja solo los SUSCRIPCIONES_POR_USUARIO dispositivos más nuevos del usuario. */
async function podarSuscripciones(db: Db, userId: string) {
  const masNuevas = db.select({ id: pushSubs.id }).from(pushSubs).where(eq(pushSubs.userId, userId))
    .orderBy(desc(pushSubs.createdAt), desc(pushSubs.id)).limit(SUSCRIPCIONES_POR_USUARIO)
  await db.delete(pushSubs).where(and(eq(pushSubs.userId, userId), notInArray(pushSubs.id, masNuevas)))
}

/** "Activar avisos" en este dispositivo (si el endpoint ya existía, pasa a ser de este usuario). Pasa a ser el más nuevo. */
export async function guardarSuscripcion(db: Db, userId: string, s: unknown): Promise<boolean> {
  if (!esSuscripcion(s)) return false
  await db.insert(pushSubs).values({ userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth })
    .onConflictDoUpdate({ target: pushSubs.endpoint, set: { userId, p256dh: s.keys.p256dh, auth: s.keys.auth, createdAt: new Date() } })
  await podarSuscripciones(db, userId)
  return true
}

/**
 * Al abrir Perfil con los avisos activados en el navegador: ¿los tiene el servidor a nombre de este usuario? Si no los
 * tiene (no se pudo guardar al activarlos, o el navegador cambió la suscripción y la vieja se borró), los vuelve a guardar.
 * Si son de otra cuenta que usa este navegador, no se los saca: los toma solo si toca "Activar avisos". Devuelve si
 * quedaron a nombre de este usuario.
 */
export async function confirmarSuscripcion(db: Db, userId: string, s: unknown): Promise<boolean> {
  if (!esSuscripcion(s)) return false
  const deQuien = async () => (await db.select({ userId: pushSubs.userId }).from(pushSubs).where(eq(pushSubs.endpoint, s.endpoint)))[0]?.userId
  const ya = await deQuien()
  if (ya === userId) {
    // sigue en uso: que no sea la primera en irse con el tope
    await db.update(pushSubs).set({ createdAt: new Date() }).where(and(eq(pushSubs.endpoint, s.endpoint), eq(pushSubs.userId, userId)))
    return true
  }
  if (ya) return false
  await db.insert(pushSubs).values({ userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }).onConflictDoNothing()
  await podarSuscripciones(db, userId)
  // si justo la guardó otro a la vez, queda del que llegó primero
  return (await deQuien()) === userId
}

export async function borrarSuscripcion(db: Db, userId: string, endpoint: string) {
  // viene del navegador tal cual: con un carácter nulo, Postgres tira error (y la acción, un 500) en vez de no borrar nada
  if (typeof endpoint !== 'string' || endpoint.length >= 1000 || endpoint.includes('\0')) return
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

/**
 * Manda un aviso a todos los dispositivos del usuario, a la vez (un servicio lento no hace esperar a los demás). Borra los
 * que ya no existen (404/410) y los de antes de los controles de guardarSuscripcion que no los pasan (otro host, claves que
 * no sirven, más de 10), sin mandarles nada. Devuelve a cuántos llegó.
 */
export async function avisar(db: Db, userId: string, aviso: Aviso, enviar: Enviar = enviarConWebPush): Promise<number> {
  const subs = (await db.select().from(pushSubs).where(eq(pushSubs.userId, userId)).orderBy(desc(pushSubs.createdAt), desc(pushSubs.id)))
    .map((s) => ({ id: s.id, suscripcion: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } }))
  const sirven = subs.filter((s) => esSuscripcion(s.suscripcion)).slice(0, SUSCRIPCIONES_POR_USUARIO)
  const borrar = subs.filter((s) => !sirven.includes(s)).map((s) => s.id)
  let llegaron = 0
  if (sirven.length) {
    const vapid = await clavesVapid(db)
    const status = await Promise.all(sirven.map((s) => enviar(s.suscripcion, aviso, vapid).catch(() => 0)))
    llegaron = status.filter((st) => st >= 200 && st < 300).length
    borrar.push(...sirven.filter((_, n) => status[n] === 404 || status[n] === 410).map((s) => s.id))
  }
  if (borrar.length) await db.delete(pushSubs).where(inArray(pushSubs.id, borrar))
  return llegaron
}

export type PruebaResult = { ok: true; llegaron: number } | { ok: false; reason: 'espera' }

/**
 * "Probar": un aviso a los dispositivos de uno mismo, como mucho uno por minuto (cada uno es un POST a cada servicio de
 * push). Se anota antes de mandar y de una sola vez: dos toques a la vez no mandan dos.
 */
export async function probarAviso(db: Db, userId: string, enviar: Enviar = enviarConWebPush): Promise<PruebaResult> {
  const [toca] = await db.update(users).set({ avisoProbadoAt: sql`now()` })
    .where(and(eq(users.id, userId), or(
      isNull(users.avisoProbadoAt), lt(users.avisoProbadoAt, sql`now() - interval '1 minute'`),
    )))
    .returning({ id: users.id })
  if (!toca) return { ok: false, reason: 'espera' }
  const llegaron = await avisar(db, userId, { title: '👉 Así llega un codazo', body: 'Cuando alguien quiera saber qué regalarte, te avisamos acá.', url: '/mi-lista' }, enviar)
  return { ok: true, llegaron }
}

export type CodazoResult =
  | { ok: true; para: string[]; avisados: number }
  | { ok: false; reason: 'no_existe' | 'propio' | 'sin_identidad' | 'ya_mandaste' | 'muchos' }

/**
 * El codazo: uno por persona y lista cada 24 h (y como mucho 5 por lista por día, 2 de ellos de invitados).
 * Le llega a cada dueño de la lista como aviso push y queda como cartel hasta que lo ve.
 */
export async function mandarCodazo(db: Db, token: string, viewer: Viewer, deNombre: string, enviar: Enviar = enviarConWebPush): Promise<CodazoResult> {
  if (!viewer.userId && !viewer.guestId) return { ok: false, reason: 'sin_identidad' }
  if (!esToken(token)) return { ok: false, reason: 'no_existe' }
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock de la lista: dos codazos a la vez no pasan juntos los topes (el segundo ve el del primero). "No key update"
    // alcanza y no frena lo que apunta a la lista mientras tanto (un deseo nuevo, una reserva).
    const [list] = await t.select().from(lists).where(eq(lists.shareToken, token)).for('no key update')
    if (!list) return { ok: false, reason: 'no_existe' } as const
    const duenos = await duenosDeLista(t, list)
    if (!duenos.length) return { ok: false, reason: 'no_existe' } as const
    if (viewer.userId && duenos.some((d) => d.id === viewer.userId)) return { ok: false, reason: 'propio' } as const

    const desde = new Date(Date.now() - CODAZO_CADA_HORAS * 3600_000)
    const deEste = viewer.userId ? eq(codazos.deUserId, viewer.userId) : eq(codazos.deGuestId, viewer.guestId!)
    const [{ mios }] = await t.select({ mios: sql<number>`count(*)::int` }).from(codazos)
      .where(and(eq(codazos.listId, list.id), deEste, gt(codazos.createdAt, desde)))
    if (mios > 0) return { ok: false, reason: 'ya_mandaste' } as const
    const [{ todos, invitados }] = await t.select({
      todos: sql<number>`count(distinct coalesce(${codazos.deUserId}, ${codazos.deGuestId}))::int`,
      invitados: sql<number>`count(distinct ${codazos.deGuestId}) filter (where ${codazos.deUserId} is null)::int`,
    }).from(codazos).where(and(eq(codazos.listId, list.id), gt(codazos.createdAt, desde)))
    if (todos >= CODAZOS_POR_DIA || (!viewer.userId && invitados >= CODAZOS_DE_INVITADOS_POR_DIA)) return { ok: false, reason: 'muchos' } as const

    await t.insert(codazos).values(duenos.map((d) => ({
      listId: list.id, paraUserId: d.id, deUserId: viewer.userId ?? null, deGuestId: viewer.userId ? null : viewer.guestId ?? null, deNombre,
    })))
    return { ok: true, list, duenos } as const
  })
  if (!r.ok) return r
  // los avisos, ya fuera de la transacción: la lista no queda bloqueada mientras contestan los servicios de push
  const { list, duenos } = r
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
