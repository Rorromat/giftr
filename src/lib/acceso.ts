import { and, eq, or } from 'drizzle-orm'
import { listasDeInvitado, lists } from '@/db/schema'
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
 *   puede ser el dueño, que se anotó en la lista de otro desde un navegador sin su sesión.
 * - otra_cuenta: sin sesión, en un navegador donde tuvo sesión un dueño (o ex co-dueño) de esta lista (la tablet de la
 *   familia después de "Cerrar sesión"): puede ser ese dueño, con la cookie de otro invitado o sin ninguna. No ve la capa
 *   oculta ni reserva; con su Google, sí.
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
  const [abierta] = await db.select({ listId: listasDeInvitado.listId }).from(listasDeInvitado)
    .where(and(eq(listasDeInvitado.guestId, viewer.guestId), eq(listasDeInvitado.listId, listId)))
  return abierta ? 'regalador' : 'confirmar'
}

/** El invitado dijo que esta lista no es suya (se anotó acá, reservó o tocó "Ver lo reservado"): desde ahora la ve. */
export async function abrirListaAInvitado(db: Db, guestId: string, listId: string) {
  await db.insert(listasDeInvitado).values({ guestId, listId }).onConflictDoNothing()
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
