import { and, eq, gte, ne, notExists, or, sql } from 'drizzle-orm'
import { listasDeInvitado, listMembers, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { esOFueDuenoSql, noEsNiFueDuenoSql, relacionConLista } from '@/lib/groups'

/**
 * Qué ve de una lista el que mira:
 * - dueno: con sesión, dueño o co-dueño. Nunca ve la capa oculta (reservas, regalos grupales, comentarios, historial).
 * - ex_dueno: con sesión, salió del grupo. Ya no edita, pero cargó esos deseos: la ve como el dueño y no reserva.
 * - regalador: la ve.
 * - sin_identidad: sin sesión ni invitado. Puede ser el dueño sin su sesión (la app de inicio, el navegador de WhatsApp).
 * - confirmar: un invitado que todavía no dijo en esta lista que no es suya. Su nombre vale para todo el navegador:
 *   puede ser el dueño, que se anotó en la lista de otro desde un navegador sin su sesión. También el que lo dijo antes de
 *   que alguien se sumara (o volviera) al grupo: puede ser ese que se sumó, que usó el link para regalar sin su sesión.
 * - otra_cuenta: sin sesión, en un navegador donde tuvo sesión un dueño (o ex co-dueño) de esta lista (la tablet de la
 *   familia después de "Cerrar sesión"): puede ser ese dueño, con la cookie de otro invitado o sin ninguna. No ve la capa
 *   oculta ni reserva; con su Google, sí. Costo aceptado: un invitado que ya había reservado acá (la abuela) deja de verlo
 *   desde este navegador, sin el cartel de que vence (ver listasAjenasSql); con su Google y "Sí, soy yo" lo recupera, y
 *   sin Google su reserva vence como cualquier otra. Un "No soy X" pediría otra marca que esta cookie no tiene, y que no
 *   venza, guardar en la base qué ve cada navegador: no vale la pena por este caso.
 * Nada de esto depende de qué reservaron los demás: al dueño le toca lo mismo en todos los casos.
 */
export type Acceso = 'dueno' | 'regalador' | 'ex_dueno' | 'sin_identidad' | 'confirmar' | 'otra_cuenta'
export type MotivoAnonimo = Exclude<Acceso, 'dueno' | 'regalador'>

export async function accesoALista(db: Db, listId: string, viewer: Viewer): Promise<Acceso> {
  if (viewer.userId) {
    const relacion = await relacionConLista(db, listId, viewer.userId)
    return relacion === 'dueno' ? 'dueno' : relacion === 'ex' ? 'ex_dueno' : 'regalador'
  }
  if (viewer.cuentas?.length) {
    const [deUnaCuenta] = await db.select({ id: lists.id }).from(lists)
      .where(and(eq(lists.id, listId), or(...viewer.cuentas.map((id) => esOFueDuenoSql(db, id)))))
    // también sin invitado: anotarse con un nombre no cambiaría nada, así que ni se le pregunta
    if (deUnaCuenta) return 'otra_cuenta'
  }
  if (!viewer.guestId) return 'sin_identidad'
  // Que no es suya vale si lo dijo después de que el último co-dueño se sumó: Martín reservó en "Casa" como invitado desde
  // el navegador de WhatsApp y después se sumó al grupo con su Google. El servidor no puede unir a los dos, así que a los
  // invitados de la lista se les vuelve a preguntar; el que es dueño entra con Google.
  // Una sorpresa, nunca sin sesión (ver sorpresas.ts): el invitado no la abre aunque diga que no es suya.
  const [abierta] = await db.select({ listId: listasDeInvitado.listId }).from(listasDeInvitado)
    .innerJoin(lists, eq(lists.id, listasDeInvitado.listId))
    .where(and(
      eq(listasDeInvitado.guestId, viewer.guestId), eq(listasDeInvitado.listId, listId), ne(lists.tipo, 'sorpresa'),
      notExists(db.select({ uno: sql`1` }).from(listMembers)
        .where(and(eq(listMembers.listId, listasDeInvitado.listId), gte(listMembers.unidoAt, listasDeInvitado.createdAt)))),
    ))
  return abierta ? 'regalador' : 'confirmar'
}

/**
 * El invitado dijo que esta lista no es suya (se anotó acá, reservó o tocó "Ver lo reservado"): desde ahora la ve. Si ya
 * lo había dicho, se anota la hora nueva (vuelve a valer después de que se sumó alguien). Todos los que llaman a esto
 * vienen con el link para regalar de ahora, que es lo que esa hora dice para los avisos (ver tieneElLinkSql).
 */
export async function abrirListaAInvitado(db: Db, guestId: string, listId: string) {
  await db.insert(listasDeInvitado).values({ guestId, listId })
    .onConflictDoUpdate({ target: [listasDeInvitado.guestId, listasDeInvitado.listId], set: { createdAt: sql`now()` } })
}

/**
 * Condición SQL para los carteles y avisos del que mira (sus reservas por vencer, deseos editados): solo deseos de listas
 * que no son (ni fueron) suyas ni de una cuenta que tuvo sesión en este navegador. En la tablet de la familia, "¿Conseguiste el
 * Termo?" le contaría a la dueña sin su sesión lo que reservó la abuela.
 */
export function listasAjenasSql(db: Db, viewer: Viewer) {
  const ids = viewer.userId ? [viewer.userId] : viewer.cuentas ?? []
  return ids.length ? and(...ids.map((id) => noEsNiFueDuenoSql(db, id))) : undefined
}
