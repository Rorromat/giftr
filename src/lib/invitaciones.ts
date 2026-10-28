import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { groupGiftMembers, groupGifts, invitacionesRegalo, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { misAmigos, personas, type Persona } from '@/lib/amigos'
import { avisar, type Enviar } from '@/lib/codazos'
import { duenosDeLista, esOFueDuenoDeLista, esUuid, juntarNombres } from '@/lib/groups'
import { admiteGente, parteParaUnoMas, sumarseARegalo } from '@/lib/regalos'
import type { Moneda } from '@/lib/pesos'

// Dividir un regalo con amigos: el que lo arma ("Lo dividimos", en el deseo) elige amigos y a cada uno le llega la
// propuesta (un aviso y la tarjeta en Inicio). Si acepta, se suma al regalo grupal (ver sumarseARegalo); si no, queda
// anotado y el que lo armó lo ve en el regalo. Se divide en partes iguales entre los que se sumen (ver comprarRegalo).
// También ya comprado: se le puede proponer a más gente, y el que acepta después entra y se vuelve a dividir (ver
// redividir). Lo comprado para un evento que ya pasó, no (ver admiteGente).
// La sorpresa no se toca: a los dueños de la lista nunca se los invita, y lo que ve el invitado es lo de cualquiera que
// regala.

/** Cuántos amigos se pueden invitar a un regalo, entre todas las veces. */
export const INVITADOS_POR_REGALO = 20

const primerNombre = (n: string) => n.split(' ')[0]

/**
 * El deseo, su lista y para quién es ("Rodri", "Delfina y Martín"; en una sorpresa, quien la recibe), de un regalo, y
 * adónde lleva (el deseo, o la sorpresa).
 */
async function delRegalo(db: Db, giftId: string) {
  const [r] = await db.select({
    giftId: groupGifts.id, organizador: groupGifts.organizerUserId, estado: groupGifts.estado, claimId: groupGifts.claimId,
    total: groupGifts.montoTotal, moneda: groupGifts.moneda, itemId: items.id, titulo: items.titulo,
    foto: items.fotoUrl, itemEstado: items.estadoDueno, listId: lists.id, ownerId: lists.ownerId, token: lists.shareToken,
    tipo: lists.tipo, paraUserId: lists.paraUserId, listaNombre: lists.nombre,
  }).from(groupGifts).innerJoin(items, eq(groupGifts.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id))
    .where(eq(groupGifts.id, giftId))
  if (!r) return null
  const sorpresa = r.tipo === 'sorpresa'
  // el nombre de alguien sin GiftR va como lo escribieron ("la abuela Marta")
  const para = !sorpresa ? juntarNombres((await duenosDeLista(db, { id: r.listId, ownerId: r.ownerId })).map((d) => primerNombre(d.nombre)))
    : r.paraUserId ? primerNombre((await personas(db, [r.paraUserId]))[0]?.nombre ?? 'Alguien') : r.listaNombre ?? 'Alguien'
  return { ...r, para, sorpresa, href: sorpresa ? `/sorpresa/${r.token}` : `/l/${r.token}/item/${r.itemId}` }
}

/** De mis amigos, a los que les puedo proponer dividir un deseo: nunca a los dueños de su lista (es la sorpresa). */
export async function amigosParaDividir(db: Db, userId: string, itemId: string): Promise<Persona[]> {
  if (!esUuid(itemId)) return []
  const [item] = await db.select({ listId: items.listId }).from(items).where(eq(items.id, itemId))
  if (!item) return []
  const amigos = [...await misAmigos(db, userId)]
  const sinDuenos = (await Promise.all(amigos.map(async (id) => ((await esOFueDuenoDeLista(db, item.listId, id)) ? null : id))))
    .filter((id): id is string => !!id)
  return (await personas(db, sinDuenos)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * El que organiza un regalo les propone dividirlo a amigos suyos, abierto o ya comprado (ver admiteGente): a cada uno
 * nuevo le queda la invitación y le llega un aviso. Los que no son sus amigos, son dueños de la lista, ya están en el
 * regalo o ya estaban invitados, no. Devuelve a cuántos invitó.
 */
export async function invitarARegalo(db: Db, giftId: string, deUserId: string, paraIds: string[], enviar?: Enviar): Promise<number> {
  if (!esUuid(giftId)) return 0
  const r = await delRegalo(db, giftId)
  if (!r || r.organizador !== deUserId || r.itemEstado !== 'activo' || !(await admiteGente(db, r))) return 0
  const amigos = await misAmigos(db, deUserId)
  const [miembros, invitados] = await Promise.all([
    db.select({ id: groupGiftMembers.userId }).from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId)),
    db.select({ id: invitacionesRegalo.paraUserId }).from(invitacionesRegalo).where(eq(invitacionesRegalo.giftId, giftId)),
  ])
  const ya = new Set([...miembros, ...invitados].map((m) => m.id))
  const lugar = Math.max(0, INVITADOS_POR_REGALO - invitados.length)
  const candidatos = [...new Set(paraIds)].filter((id) => esUuid(id) && amigos.has(id) && !ya.has(id))
  const nuevos: string[] = []
  for (const id of candidatos) {
    if (nuevos.length >= lugar) break
    if (!(await esOFueDuenoDeLista(db, r.listId, id))) nuevos.push(id)
  }
  if (!nuevos.length) return 0
  const insertados = await db.insert(invitacionesRegalo).values(nuevos.map((paraUserId) => ({ giftId, deUserId, paraUserId })))
    .onConflictDoNothing().returning({ para: invitacionesRegalo.paraUserId })
  const [de] = await personas(db, [deUserId])
  const quien = primerNombre(de?.nombre ?? 'Alguien')
  const comprado = r.estado === 'comprado'
  await Promise.all(insertados.map((i) => avisar(db, i.para, r.sorpresa
    ? {
      de: deUserId,
      title: `🤫 ${quien} te propone una sorpresa`,
      body: `"${r.titulo}" para ${r.para}: no está en su lista y no se entera. ${comprado ? 'Ya la compró: en' : 'En'} partes iguales, ¿te sumás?`,
      url: '/inicio#invitaciones',
    }
    : {
      de: deUserId,
      title: `🎁 ${quien} te propone dividir un regalo`,
      body: `"${r.titulo}" para ${r.para}, en partes iguales.${comprado ? ' Ya lo compró.' : ''} ¿Te sumás?`,
      url: '/inicio#invitaciones',
    }, enviar).catch(() => 0)))
  return insertados.length
}

export type Invitacion = {
  id: string
  de: Persona
  giftId: string
  itemId: string
  titulo: string
  foto: string | null
  /** el link de su lista, para ver el deseo y el regalo */
  token: string
  /** al deseo, o a la sorpresa */
  href: string
  /** para quién es ("Rodri", "Delfina y Martín") */
  para: string
  /** un regalo que no está en su lista (ver sorpresas.ts) */
  sorpresa: boolean
  /** cuántos están en el regalo hoy (el que lo armó incluido) */
  somos: number
  /** ya lo compró: si se suma, se vuelve a dividir */
  comprado: boolean
  /** ya comprado, lo que le tocaría si se suma (partes iguales); null si no se compró o lo dividieron a mano */
  parte: number | null
  moneda: Moneda
}

/**
 * Las propuestas que me esperan: de regalos a los que todavía se puede sumar gente (abiertos, o comprados para el evento
 * que viene: ver admiteGente), de deseos que siguen en la lista, y en las que no estoy.
 */
export async function invitacionesPendientes(db: Db, userId: string): Promise<Invitacion[]> {
  const filas = await db.select({ id: invitacionesRegalo.id, giftId: invitacionesRegalo.giftId, de: invitacionesRegalo.deUserId })
    .from(invitacionesRegalo).innerJoin(groupGifts, eq(invitacionesRegalo.giftId, groupGifts.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .where(and(eq(invitacionesRegalo.paraUserId, userId), eq(invitacionesRegalo.estado, 'pendiente'), inArray(groupGifts.estado, ['abierto', 'comprado']),
      eq(items.estadoDueno, 'activo')))
    .orderBy(desc(invitacionesRegalo.createdAt))
  if (!filas.length) return []
  const miembros = await db.select({ giftId: groupGiftMembers.giftId, userId: groupGiftMembers.userId, monto: groupGiftMembers.monto })
    .from(groupGiftMembers)
    .where(inArray(groupGiftMembers.giftId, filas.map((f) => f.giftId)))
    .orderBy(asc(groupGiftMembers.createdAt))
  const deQuien = new Map((await personas(db, [...new Set(filas.map((f) => f.de))])).map((p) => [p.id, p]))
  const vistas = await Promise.all(filas.map(async (f): Promise<Invitacion | null> => {
    const enEl = miembros.filter((m) => m.giftId === f.giftId)
    // ya se sumó por su cuenta ("Me sumo" en el deseo): no hay nada que contestar
    if (enEl.some((m) => m.userId === userId)) return null
    const r = await delRegalo(db, f.giftId)
    const de = deQuien.get(f.de)
    if (!r || !de || !(await admiteGente(db, r))) return null
    const comprado = r.estado === 'comprado'
    // las partes en el orden de la pantalla: el encargado primero
    const partes = [...enEl.filter((m) => m.userId === r.organizador), ...enEl.filter((m) => m.userId !== r.organizador)].map((m) => m.monto)
    return {
      id: f.id, de, giftId: f.giftId, itemId: r.itemId, titulo: r.titulo, foto: r.foto, token: r.token, href: r.href, para: r.para,
      sorpresa: r.sorpresa, somos: enEl.length, comprado, parte: comprado ? parteParaUnoMas(r.total, partes) : null, moneda: r.moneda,
    }
  }))
  return vistas.filter((v): v is Invitacion => !!v)
}

export type Respuesta = { ok: true; token: string; itemId: string; href: string } | { ok: false; reason: 'no_existe' | 'no_se_pudo' }

/**
 * Contestar una propuesta. Si acepta, se suma al regalo (con las mismas reglas que "Me sumo": si cerró, si ya lo tenía por
 * su cuenta, no_se_pudo); si no, queda rechazada. Al que lo armó se le avisa las dos cosas: así sabe con quién cuenta.
 */
export async function responderInvitacion(db: Db, userId: string, id: string, acepta: boolean, enviar?: Enviar): Promise<Respuesta> {
  if (!esUuid(id)) return { ok: false, reason: 'no_existe' }
  const [inv] = await db.select().from(invitacionesRegalo)
    .where(and(eq(invitacionesRegalo.id, id), eq(invitacionesRegalo.paraUserId, userId), eq(invitacionesRegalo.estado, 'pendiente')))
  if (!inv) return { ok: false, reason: 'no_existe' }
  const r = await delRegalo(db, inv.giftId)
  if (!r) return { ok: false, reason: 'no_existe' }
  const sumado = acepta && await sumarseARegalo(db, inv.giftId, userId, r.itemId)
  await db.update(invitacionesRegalo).set({ estado: sumado ? 'aceptada' : 'rechazada', respondidaAt: new Date() })
    .where(eq(invitacionesRegalo.id, id))
  if (acepta && !sumado) return { ok: false, reason: 'no_se_pudo' }
  const [yo] = await personas(db, [userId])
  const quien = primerNombre(yo?.nombre ?? 'Alguien')
  await avisar(db, inv.deUserId, sumado
    ? {
      title: `🤝 ${quien} se suma a "${r.titulo}"`,
      body: r.estado === 'comprado' ? 'Ya lo habías comprado: se volvió a dividir con su parte.' : `Lo dividen en partes iguales para ${r.para}.`,
      url: r.href, de: userId,
    }
    : { title: `${quien} no se suma a "${r.titulo}"`, body: 'Podés invitar a alguien más desde el regalo.', url: r.href, de: userId },
  enviar).catch(() => 0)
  return { ok: true, token: r.token, itemId: r.itemId, href: r.href }
}

export type Invitado = { persona: Persona; estado: 'esperando' | 'se_sumo' | 'no_puede' | 'se_bajo' }

/** Para el que organiza: a quiénes invitó y qué pasó con cada uno (si se sumó y después se bajó, también). */
export async function invitadosDeRegalo(db: Db, giftId: string): Promise<Invitado[]> {
  const [filas, miembros] = await Promise.all([
    db.select({ para: invitacionesRegalo.paraUserId, estado: invitacionesRegalo.estado }).from(invitacionesRegalo)
      .where(eq(invitacionesRegalo.giftId, giftId)).orderBy(invitacionesRegalo.createdAt),
    db.select({ id: groupGiftMembers.userId }).from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId)),
  ])
  const adentro = new Set(miembros.map((m) => m.id))
  const gente = new Map((await personas(db, filas.map((f) => f.para))).map((p) => [p.id, p]))
  return filas.flatMap((f) => {
    const persona = gente.get(f.para)
    if (!persona) return []
    const estado: Invitado['estado'] = adentro.has(f.para) ? 'se_sumo'
      : f.estado === 'pendiente' ? 'esperando' : f.estado === 'aceptada' ? 'se_bajo' : 'no_puede'
    return [{ persona, estado }]
  })
}
