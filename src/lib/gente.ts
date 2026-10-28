import { and, asc, count, eq, exists, inArray, isNull, notInArray } from 'drizzle-orm'
import { items, listFollows, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { esUuid, noEsNiFueDuenoSql, relacionDeLista, type Dueno } from '@/lib/groups'
import { misAmigos } from '@/lib/amigos'
import { diasEntre, hoyLocal, proximaDeGrupo, proximaFecha } from '@/lib/events'
import { urlFoto } from '@/lib/users'

// Tu gente: las listas que abriste con tu cuenta (las que "seguís"), con su próximo cumple o fecha. Y las listas en común
// de tus amigos (la de su hijo, la de la abuela), que van como una persona más: si no la agregaste todavía, se agrega con
// un toque, y recién ahí su cumple entra en tus Eventos.
// Va en un solo sentido: a nadie se le muestra quién sigue su lista (regla de la sorpresa).

export type Contacto = {
  listId: string
  tipo: 'personal' | 'grupo'
  /** El nombre del dueño, o el del grupo. */
  nombre: string
  duenos: Dueno[]
  /** El link para regalar. En una que no agregaste no se muestra: abrirla la agrega (ver seguirLista). */
  href: string
  /** Deseos activos de la lista. */
  deseos: number
  /** El próximo cumple (lista personal) o la fecha del grupo; null si no cargaron ninguna. */
  proxima: { fecha: Date; dias: number } | null
  /** Si la seguís. Una lista en común de un amigo que no agregaste, no: está para agregarla si querés. */
  agregada: boolean
  /** De un grupo: su foto, si es el cumple de alguien y qué es para sus dueños ("Hijo de Rodri y Euge"). */
  foto: string | null
  esCumple: boolean
  relacion: string | null
}

/**
 * Los grupos que arma algún amigo suyo (sigue en el grupo) y que no sigue (o solo ese, con soloEsta). Ni los que arma o
 * armó él: de esos no ve reservas (ver esOFueDuenoSql).
 */
function deAmigosSinAgregar(db: Db, userId: string, amigos: string[], soloEsta?: string) {
  return db.select().from(lists).where(and(
    soloEsta ? eq(lists.id, soloEsta) : undefined,
    eq(lists.tipo, 'grupo'),
    exists(db.select({ id: listMembers.userId }).from(listMembers).where(and(
      eq(listMembers.listId, lists.id), inArray(listMembers.userId, amigos), isNull(listMembers.salioAt),
    ))),
    notInArray(lists.id, db.select({ id: listFollows.listId }).from(listFollows).where(eq(listFollows.userId, userId))),
    noEsNiFueDuenoSql(db, userId),
  ))
}

/**
 * Tu gente por orden alfabético, con las listas en común de tus amigos entre las personas. Las listas de las que sos (o
 * fuiste) dueño o co-dueño no cuentan.
 */
export async function miGente(db: Db, userId: string, hoy = hoyLocal()): Promise<Contacto[]> {
  const amigos = [...await misAmigos(db, userId)]
  const [seguidas, sinAgregar] = await Promise.all([
    db.select({ list: lists }).from(listFollows)
      .innerJoin(lists, eq(listFollows.listId, lists.id))
      .where(and(eq(listFollows.userId, userId), noEsNiFueDuenoSql(db, userId)))
      // una sorpresa no se sigue (no es la lista de nadie, ver sorpresas.ts)
      .then((rows) => rows.flatMap((r) => (r.list.tipo === 'sorpresa' ? [] : [{ ...r.list, tipo: r.list.tipo, agregada: true }]))),
    amigos.length ? deAmigosSinAgregar(db, userId, amigos).then((rows) => rows.map((l) => ({ ...l, tipo: 'grupo' as const, agregada: false }))) : [],
  ])
  const todas = [...seguidas, ...sinAgregar]
  if (!todas.length) return []

  const ids = todas.map((l) => l.id)
  const ownerIds = todas.flatMap((l) => (l.ownerId ? [l.ownerId] : []))
  const grupoIds = todas.filter((l) => l.tipo === 'grupo').map((l) => l.id)
  const campos = { id: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl }
  const [owners, miembros, conteos] = await Promise.all([
    ownerIds.length
      ? db.select({ ...campos, cumpleDia: users.cumpleDia, cumpleMes: users.cumpleMes }).from(users).where(inArray(users.id, ownerIds))
      : [],
    grupoIds.length
      ? db.select({ ...campos, listId: listMembers.listId, parentesco: listMembers.parentesco })
        .from(listMembers).innerJoin(users, eq(listMembers.userId, users.id))
        .where(and(inArray(listMembers.listId, grupoIds), isNull(listMembers.salioAt))).orderBy(asc(listMembers.createdAt))
      : [],
    db.select({ listId: items.listId, n: count() }).from(items)
      .where(and(inArray(items.listId, ids), eq(items.estadoDueno, 'activo'))).groupBy(items.listId),
  ])

  return todas.map((list): Contacto => {
    const owner = owners.find((o) => o.id === list.ownerId)
    const duenos = owner ? [owner] : miembros.filter((m) => m.listId === list.id)
    const fecha = list.tipo === 'personal'
      ? owner?.cumpleDia && owner.cumpleMes ? proximaFecha(owner.cumpleDia, owner.cumpleMes, hoy) : null
      : proximaDeGrupo(list.eventoFecha, list.eventoAnual, hoy)
    const grupo = list.tipo === 'grupo'
    return {
      listId: list.id,
      tipo: list.tipo,
      nombre: grupo ? list.nombre ?? 'Grupo' : owner?.nombre ?? '',
      duenos: duenos.map((d) => ({ id: d.id, nombre: d.nombre, foto: urlFoto(d), ...('parentesco' in d && { parentesco: d.parentesco }) })),
      href: `/l/${list.shareToken}`,
      deseos: conteos.find((c) => c.listId === list.id)?.n ?? 0,
      proxima: fecha && { fecha, dias: diasEntre(hoy, fecha) },
      agregada: list.agregada,
      foto: grupo ? list.fotoUrl : null,
      esCumple: grupo && list.esCumple,
      relacion: grupo ? relacionDeLista(duenos) : null,
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}

/**
 * "Agregar" una lista en común de un amigo: pasa a estar en tu gente y su fecha en tus Eventos, como si hubieras abierto
 * su link. Solo un grupo que arma (hoy) un amigo tuyo, y nunca uno que armás o armaste vos.
 */
export async function agregarListaDeAmigo(db: Db, userId: string, listId: string): Promise<boolean> {
  if (!esUuid(listId)) return false
  const amigos = [...await misAmigos(db, userId)]
  if (!amigos.length) return false
  const [list] = await deAmigosSinAgregar(db, userId, amigos, listId)
  if (!list) return false
  await db.insert(listFollows).values({ userId, listId }).onConflictDoNothing()
  return true
}
