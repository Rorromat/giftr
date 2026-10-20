import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { items, listFollows, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { noEsDuenoSql, type Dueno } from '@/lib/groups'
import { diasEntre, hoyLocal, proximaDeGrupo, proximaFecha } from '@/lib/events'
import { urlFoto } from '@/lib/users'

// Tu gente: las listas que abriste con tu cuenta (las que "seguís"), con su próximo cumple o fecha.
// Va en un solo sentido: a nadie se le muestra quién sigue su lista (regla de la sorpresa).

export type Contacto = {
  listId: string
  tipo: 'personal' | 'grupo'
  /** El nombre del dueño, o el del grupo. */
  nombre: string
  duenos: Dueno[]
  href: string
  /** Deseos activos de la lista. */
  deseos: number
  /** El próximo cumple (lista personal) o la fecha del grupo; null si no cargaron ninguna. */
  proxima: { fecha: Date; dias: number } | null
}

/** Tu gente por orden alfabético. Las listas de las que sos dueño o co-dueño no cuentan. */
export async function miGente(db: Db, userId: string, hoy = hoyLocal()): Promise<Contacto[]> {
  const seguidas = await db.select({ list: lists }).from(listFollows)
    .innerJoin(lists, eq(listFollows.listId, lists.id))
    .where(and(eq(listFollows.userId, userId), noEsDuenoSql(db, userId)))
    .then((rows) => rows.map((r) => r.list))
  if (!seguidas.length) return []

  const ids = seguidas.map((l) => l.id)
  const ownerIds = seguidas.flatMap((l) => (l.ownerId ? [l.ownerId] : []))
  const grupoIds = seguidas.filter((l) => l.tipo === 'grupo').map((l) => l.id)
  const campos = { id: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl }
  const [owners, miembros, conteos] = await Promise.all([
    ownerIds.length
      ? db.select({ ...campos, cumpleDia: users.cumpleDia, cumpleMes: users.cumpleMes }).from(users).where(inArray(users.id, ownerIds))
      : [],
    grupoIds.length
      ? db.select({ ...campos, listId: listMembers.listId })
        .from(listMembers).innerJoin(users, eq(listMembers.userId, users.id))
        .where(inArray(listMembers.listId, grupoIds)).orderBy(asc(listMembers.createdAt))
      : [],
    db.select({ listId: items.listId, n: count() }).from(items)
      .where(and(inArray(items.listId, ids), eq(items.estadoDueno, 'activo'))).groupBy(items.listId),
  ])

  return seguidas.map((list): Contacto => {
    const owner = owners.find((o) => o.id === list.ownerId)
    const duenos = owner ? [owner] : miembros.filter((m) => m.listId === list.id)
    const fecha = list.tipo === 'personal'
      ? owner?.cumpleDia && owner.cumpleMes ? proximaFecha(owner.cumpleDia, owner.cumpleMes, hoy) : null
      : proximaDeGrupo(list.eventoFecha, list.eventoAnual, hoy)
    return {
      listId: list.id,
      tipo: list.tipo,
      nombre: list.tipo === 'grupo' ? list.nombre ?? 'Grupo' : owner?.nombre ?? '',
      duenos: duenos.map((d) => ({ id: d.id, nombre: d.nombre, foto: urlFoto(d) })),
      href: `/l/${list.shareToken}`,
      deseos: conteos.find((c) => c.listId === list.id)?.n ?? 0,
      proxima: fecha && { fecha, dias: diasEntre(hoy, fecha) },
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}
