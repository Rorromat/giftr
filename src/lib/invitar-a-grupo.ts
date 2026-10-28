import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import { avisos, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { avisar, type Enviar } from '@/lib/codazos'
import { misAmigos, personas, type Persona } from '@/lib/amigos'
import { esDuenoSql, esUuid } from '@/lib/groups'

// "¿Con quién la armás?": al crear una lista en común (o después, desde el grupo) se eligen amigos y a cada uno le llega
// el aviso con el nombre de la lista. El aviso lleva a la invitación de siempre (/grupos/unirme), que pide un toque para
// sumarse: ser dueño es no ver nunca quién regala qué en esa lista, ni aunque después salga, y eso lo decide cada uno.

/** A la misma persona, por la misma lista, como mucho un aviso por día (un doble envío, o elegirla de nuevo). */
const CADA_HORAS = 24

const primerNombre = (n: string) => n.trim().split(/\s+/)[0]

/** Los amigos que todavía no la arman (los que salieron sí: pueden volver), para elegir a quién invitar. */
export async function amigosParaInvitar(db: Db, listId: string, userId: string): Promise<Persona[]> {
  if (!esUuid(listId)) return []
  const [amigos, duenos] = await Promise.all([
    misAmigos(db, userId),
    db.select({ id: listMembers.userId }).from(listMembers).where(and(eq(listMembers.listId, listId), isNull(listMembers.salioAt))),
  ])
  for (const d of duenos) amigos.delete(d.id)
  return (await personas(db, [...amigos])).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Les avisa a los amigos elegidos que los sumaron a la lista: "Rodri te sumó a la lista en común "Juancito"", con el link
 * de invitación de ahora (si cambia, el aviso deja de servir, como el link que se mandó por WhatsApp). Solo un dueño, solo
 * a sus amigos y a los que todavía no la arman, y una vez por día por persona. Devuelve a quiénes se les avisó.
 */
export async function invitarAGrupo(db: Db, listId: string, deUserId: string, elegidos: string[], enviar?: Enviar): Promise<string[]> {
  if (!esUuid(listId)) return []
  const [list] = await db.select({ nombre: lists.nombre, inviteToken: lists.inviteToken }).from(lists)
    .where(and(eq(lists.id, listId), eq(lists.tipo, 'grupo'), esDuenoSql(db, deUserId)))
  if (!list?.inviteToken) return []
  const posibles = new Set((await amigosParaInvitar(db, listId, deUserId)).map((p) => p.id))
  const para = [...new Set(elegidos)].filter((id) => posibles.has(id))
  if (!para.length) return []

  const url = `/grupos/unirme/${list.inviteToken}`
  const yaAvisados = new Set((await db.select({ userId: avisos.userId }).from(avisos)
    .where(and(inArray(avisos.userId, para), eq(avisos.url, url), gt(avisos.createdAt, new Date(Date.now() - CADA_HORAS * 3600_000)))))
    .map((a) => a.userId))
  const [yo] = await db.select({ nombre: users.nombre }).from(users).where(eq(users.id, deUserId))
  const aviso = {
    tipo: 'lista_en_comun' as const,
    title: `👥 ${primerNombre(yo?.nombre ?? 'Alguien')} te sumó a la lista en común "${list.nombre ?? 'Grupo'}"`,
    body: 'Tocá para entrar: van a poder agregar y editar juntos.',
    url, de: deUserId,
  }
  const avisados: string[] = []
  for (const id of para.filter((p) => !yaAvisados.has(p))) {
    // que no llegue un aviso no frena a los demás (ni la lista, que ya está creada)
    const ok = await avisar(db, id, aviso, enviar).then(() => true, () => false)
    if (ok) avisados.push(id)
  }
  return avisados
}
