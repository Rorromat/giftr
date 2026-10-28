import { and, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { avisos, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import type { Aviso } from '@/lib/codazos'
import { avisosDeDeseos, markNotificationsRead, textoDeAviso } from '@/lib/notifications'
import { urlFoto } from '@/lib/users'
import { esUuid } from '@/lib/groups'

// La bandeja de Avisos: lo que te llegó (codazos, solicitudes, propuestas, el amigo invisible, las cuentas) y los avisos
// sobre los deseos que regalás, en un solo lugar. Lo de después de la última vez que la abriste es nuevo: la campanita lo
// cuenta, y lo nuevo que te pide algo va también arriba en Inicio ("Para vos").

/** Cuántos días se guarda lo que llegó. */
export const DIAS_EN_BANDEJA = 60
/** Cuántos se muestran como mucho. */
export const EN_BANDEJA = 60

const desdeHace = (dias: number) => new Date(Date.now() - dias * 86_400_000)

export type TipoEnBandeja = NonNullable<(typeof avisos.$inferInsert)['tipo']>

/**
 * Lo que va en "Para vos", arriba en Inicio: lo que te pide hacer algo (pagar tu parte, ver a quién le regalás, contestarle
 * a tu amigo invisible) o que estabas esperando (te pagaron, te contestaron). Los codazos, las solicitudes de amistad, las
 * propuestas para dividir y las invitaciones al amigo invisible no: mientras esperan que contestes ya tienen su cartel en
 * Inicio, con sus botones. Que aceptaron tu solicitud o se sumaron a tu regalo, tampoco: no te piden nada.
 */
export const PARA_VOS: TipoEnBandeja[] = ['regalo_comprado', 'pago', 'invisible_sorteo', 'invisible_pregunta', 'invisible_respuesta']
/** Cuántos van en "Para vos" como mucho (el resto, en la campanita), y de cuántos días para acá. */
export const EN_PARA_VOS = 3
export const DIAS_PARA_VOS = 7

/** Lo guarda en la bandeja tal como se manda al celular (ver avisar). De paso, se van los de hace más de 60 días. */
export async function guardarAviso(db: Db, userId: string, aviso: Aviso & { tipo?: TipoEnBandeja }, de: string | null = null) {
  await db.insert(avisos).values({ userId, deUserId: de, tipo: aviso.tipo ?? null, titulo: aviso.title, cuerpo: aviso.body, url: aviso.url })
  await db.delete(avisos).where(and(eq(avisos.userId, userId), lt(avisos.createdAt, desdeHace(DIAS_EN_BANDEJA))))
}

export type EntradaBandeja = {
  id: string
  emoji: string
  titulo: string
  cuerpo: string | null
  href: string | null
  /** quién lo mandó (su foto); null si es anónimo, de un invitado o sobre un deseo */
  de: { nombre: string; foto: string | null } | null
  /** qué es, para su ícono (ver IconoAviso); null en los avisos sobre deseos y en los de antes de que tuvieran tipo */
  tipo: TipoEnBandeja | null
  createdAt: Date
  nuevo: boolean
}

// el emoji del principio del título va aparte, en el círculo
const EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u

export function separarEmoji(titulo: string): { emoji: string | null; texto: string } {
  const m = titulo.match(EMOJI)
  return m ? { emoji: m[1], texto: titulo.slice(m[0].length) } : { emoji: null, texto: titulo }
}

const EMOJI_DESEO: Record<string, string> = {
  item_editado: '✏️', compra_corregida: '💸', item_vuelve: '↩️', compra_vuelve: '↩️', regalo_vuelve: '↩️',
  item_baja: '📦', item_baja_comprado: '📦', regalo_baja: '📦', regalo_lo_tiene: '📦',
}

/** El cartel de un aviso sobre un deseo, partido en título y detalle donde tiene la raya. */
function partirTexto(texto: string): { titulo: string; cuerpo: string | null } {
  const [titulo, ...resto] = texto.split(' — ')
  const cuerpo = resto.join(' — ')
  return { titulo, cuerpo: cuerpo ? cuerpo[0].toUpperCase() + cuerpo.slice(1) : null }
}

async function vistosAt(db: Db, userId: string): Promise<Date | null> {
  const [u] = await db.select({ vistos: users.avisosVistosAt }).from(users).where(eq(users.id, userId))
  return u?.vistos ?? null
}

/** Los de la tabla avisos, con quién lo mandó (en una consulta con leftJoin a users por deUserId). */
const columnasAviso = {
  id: avisos.id, tipo: avisos.tipo, titulo: avisos.titulo, cuerpo: avisos.cuerpo, url: avisos.url, vistoAt: avisos.vistoAt,
  createdAt: avisos.createdAt, de: { id: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl },
}

type FilaAviso = {
  id: string; tipo: TipoEnBandeja | null; titulo: string; cuerpo: string; url: string; vistoAt: Date | null; createdAt: Date
  de: { id: string; nombre: string; fotoAt: Date | null; avatarUrl: string | null } | null
}

/** Nuevo: de después de la última vez que abrió la campanita, y no lo limpió de "Para vos". */
function entrada(a: FilaAviso, vistos: Date | null): EntradaBandeja {
  const { emoji, texto } = separarEmoji(a.titulo)
  return {
    id: a.id, emoji: emoji ?? '🔔', titulo: texto, cuerpo: a.cuerpo || null, href: a.url, createdAt: a.createdAt,
    de: a.de ? { nombre: a.de.nombre, foto: urlFoto(a.de) } : null, tipo: a.tipo,
    nuevo: (!vistos || a.createdAt > vistos) && !a.vistoAt,
  }
}

/** Lo de la bandeja, lo más nuevo primero, y cuándo se armó (lo que se marca visto al abrirla). */
export async function bandeja(db: Db, viewer: Viewer & { userId: string }): Promise<{ entradas: EntradaBandeja[]; hasta: Date }> {
  const hasta = new Date()
  const desde = desdeHace(DIAS_EN_BANDEJA)
  const [vistos, propios, deDeseos] = await Promise.all([
    vistosAt(db, viewer.userId),
    db.select(columnasAviso).from(avisos).leftJoin(users, eq(avisos.deUserId, users.id))
      .where(and(eq(avisos.userId, viewer.userId), gte(avisos.createdAt, desde)))
      .orderBy(desc(avisos.createdAt)).limit(EN_BANDEJA),
    avisosDeDeseos(db, viewer, { desde }),
  ])
  const entradas: EntradaBandeja[] = [
    ...propios.map((a) => entrada(a, vistos)),
    ...deDeseos.flatMap((n) => {
      const texto = textoDeAviso(n.tipo, n.itemTitulo, n.sorpresa)
      if (!texto) return []
      return [{
        id: n.id, emoji: EMOJI_DESEO[n.tipo] ?? '🎁', ...partirTexto(texto), href: n.href, de: null, tipo: null, createdAt: n.createdAt, nuevo: !n.leida,
      }]
    }),
  ]
  entradas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return { entradas: entradas.slice(0, EN_BANDEJA), hasta }
}

/** Los de "Para vos": los que te piden algo (ver PARA_VOS), nuevos y de la última semana. */
function deParaVos(userId: string, vistos: Date | null) {
  const semana = desdeHace(DIAS_PARA_VOS)
  return and(eq(avisos.userId, userId), inArray(avisos.tipo, PARA_VOS), isNull(avisos.vistoAt),
    gt(avisos.createdAt, vistos && vistos > semana ? vistos : semana))
}

/**
 * "Para vos", en Inicio: lo nuevo de la bandeja que te pide algo (ver PARA_VOS), de la última semana, lo más nuevo primero;
 * cuántos son (se muestran los primeros) y cuándo se armó (lo que se limpia con "Limpiar", ver limpiarParaVos). Como el
 * número de la campanita: al abrirla dejan de ser nuevos y se van de Inicio (siguen en la bandeja).
 */
export async function paraVos(db: Db, userId: string): Promise<{ entradas: EntradaBandeja[]; total: number; hasta: Date }> {
  const hasta = new Date()
  const vistos = await vistosAt(db, userId)
  const [filas, [{ total }]] = await Promise.all([
    db.select(columnasAviso).from(avisos).leftJoin(users, eq(avisos.deUserId, users.id))
      .where(deParaVos(userId, vistos)).orderBy(desc(avisos.createdAt)).limit(EN_PARA_VOS),
    db.select({ total: count() }).from(avisos).where(deParaVos(userId, vistos)),
  ])
  return { entradas: filas.map((a) => entrada(a, vistos)), total, hasta }
}

/**
 * "Limpiar" en Inicio: los de "Para vos" que había cuando se armó la pantalla (también los que no entraban) ya no son
 * nuevos, ni ahí ni en la campanita; lo demás de la campanita sigue como estaba. Lo que llegó después, no.
 */
export async function limpiarParaVos(db: Db, userId: string, hasta: Date) {
  const h = new Date(Math.min(hasta.getTime(), Date.now()))
  if (Number.isNaN(h.getTime())) return
  await db.update(avisos).set({ vistoAt: new Date() })
    .where(and(eq(avisos.userId, userId), inArray(avisos.tipo, PARA_VOS), isNull(avisos.vistoAt), lte(avisos.createdAt, h)))
}

/**
 * Uno de "Para vos" que abrió (tocándolo, o "Ver" al deslizarlo) o que deslizó para archivarlo: se va de ahí y ya no es
 * nuevo en la campanita. Devuelve adónde lleva; null si no es suyo.
 */
export async function marcarAvisoVisto(db: Db, userId: string, id: string): Promise<string | null> {
  if (!esUuid(id)) return null
  const [a] = await db.update(avisos).set({ vistoAt: sql`coalesce(${avisos.vistoAt}, now())` })
    .where(and(eq(avisos.id, id), eq(avisos.userId, userId)))
    .returning({ url: avisos.url })
  return a?.url ?? null
}

/** Cuántos nuevos tiene (el número de la campanita). */
export async function avisosSinLeer(db: Db, viewer: Viewer & { userId: string }): Promise<number> {
  const [vistos, deDeseos] = await Promise.all([vistosAt(db, viewer.userId), avisosDeDeseos(db, viewer)])
  const [{ n }] = await db.select({ n: count() }).from(avisos)
    .where(and(eq(avisos.userId, viewer.userId), gte(avisos.createdAt, desdeHace(DIAS_EN_BANDEJA)), vistos ? gt(avisos.createdAt, vistos) : undefined,
      isNull(avisos.vistoAt)))
  return n + deDeseos.filter((d) => textoDeAviso(d.tipo, d.itemTitulo, d.sorpresa)).length
}

/**
 * Abrió la bandeja: lo que había hasta que se armó deja de ser nuevo (lo que llegó mientras la miraba, no). Nunca va para
 * atrás: una pestaña vieja no vuelve a marcar nuevo lo que ya vio.
 */
export async function marcarBandejaVista(db: Db, viewer: Viewer & { userId: string }, hasta: Date) {
  const h = new Date(Math.min(hasta.getTime(), Date.now()))
  if (Number.isNaN(h.getTime())) return
  await db.update(users).set({ avisosVistosAt: h })
    .where(and(eq(users.id, viewer.userId), or(isNull(users.avisosVistosAt), lt(users.avisosVistosAt, h))))
  await markNotificationsRead(db, viewer, h)
}
