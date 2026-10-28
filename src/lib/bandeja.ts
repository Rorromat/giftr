import { and, count, desc, eq, gt, gte, isNull, lt, or } from 'drizzle-orm'
import { avisos, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import type { Aviso } from '@/lib/codazos'
import { avisosDeDeseos, markNotificationsRead, textoDeAviso } from '@/lib/notifications'
import { urlFoto } from '@/lib/users'

// La bandeja de Avisos: lo que te llegó (codazos, solicitudes, propuestas, el amigo invisible) y los avisos sobre los
// deseos que regalás, en un solo lugar. Lo de después de la última vez que la abriste es nuevo: la campanita lo cuenta.

/** Cuántos días se guarda lo que llegó. */
export const DIAS_EN_BANDEJA = 60
/** Cuántos se muestran como mucho. */
export const EN_BANDEJA = 60

const desdeHace = (dias: number) => new Date(Date.now() - dias * 86_400_000)

/** Lo guarda en la bandeja tal como se manda al celular (ver avisar). De paso, se van los de hace más de 60 días. */
export async function guardarAviso(db: Db, userId: string, aviso: Aviso, de: string | null = null) {
  await db.insert(avisos).values({ userId, deUserId: de, titulo: aviso.title, cuerpo: aviso.body, url: aviso.url })
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
  item_editado: '✏️', compra_corregida: '💸', regalo_redividido: '💸', regalo_a_mano: '💸', item_vuelve: '↩️', compra_vuelve: '↩️', regalo_vuelve: '↩️',
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

/** Lo de la bandeja, lo más nuevo primero, y cuándo se armó (lo que se marca visto al abrirla). */
export async function bandeja(db: Db, viewer: Viewer & { userId: string }): Promise<{ entradas: EntradaBandeja[]; hasta: Date }> {
  const hasta = new Date()
  const desde = desdeHace(DIAS_EN_BANDEJA)
  const [vistos, propios, deDeseos] = await Promise.all([
    vistosAt(db, viewer.userId),
    db.select({
      id: avisos.id, titulo: avisos.titulo, cuerpo: avisos.cuerpo, url: avisos.url, createdAt: avisos.createdAt,
      de: { id: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl },
    }).from(avisos).leftJoin(users, eq(avisos.deUserId, users.id))
      .where(and(eq(avisos.userId, viewer.userId), gte(avisos.createdAt, desde)))
      .orderBy(desc(avisos.createdAt)).limit(EN_BANDEJA),
    avisosDeDeseos(db, viewer, { desde }),
  ])
  const entradas: EntradaBandeja[] = [
    ...propios.map((a) => {
      const { emoji, texto } = separarEmoji(a.titulo)
      return {
        id: a.id, emoji: emoji ?? '🔔', titulo: texto, cuerpo: a.cuerpo || null, href: a.url, createdAt: a.createdAt,
        de: a.de ? { nombre: a.de.nombre, foto: urlFoto(a.de) } : null,
        nuevo: !vistos || a.createdAt > vistos,
      }
    }),
    ...deDeseos.flatMap((n) => {
      const texto = textoDeAviso(n.tipo, n.itemTitulo, n.sorpresa)
      if (!texto) return []
      return [{ id: n.id, emoji: EMOJI_DESEO[n.tipo] ?? '🎁', ...partirTexto(texto), href: n.href, de: null, createdAt: n.createdAt, nuevo: !n.leida }]
    }),
  ]
  entradas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return { entradas: entradas.slice(0, EN_BANDEJA), hasta }
}

/** Cuántos nuevos tiene (el número de la campanita). */
export async function avisosSinLeer(db: Db, viewer: Viewer & { userId: string }): Promise<number> {
  const [vistos, deDeseos] = await Promise.all([vistosAt(db, viewer.userId), avisosDeDeseos(db, viewer)])
  const [{ n }] = await db.select({ n: count() }).from(avisos)
    .where(and(eq(avisos.userId, viewer.userId), gte(avisos.createdAt, desdeHace(DIAS_EN_BANDEJA)), vistos ? gt(avisos.createdAt, vistos) : undefined))
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
