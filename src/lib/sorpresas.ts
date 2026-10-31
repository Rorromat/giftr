import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, listFollows, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { misAmigos, personas } from '@/lib/amigos'
import type { Enviar } from '@/lib/codazos'
import { desdeElUltimoEvento, eventoDeLista, hoyLocal } from '@/lib/events'
import { esOFueDuenoDeLista, esToken, esUuid, fechaDeGrupoValida } from '@/lib/groups'
import { invitarARegalo } from '@/lib/invitaciones'
import { acotarDeseo, cambiarDeseo, type CambiosDeseo, type NewItemData } from '@/lib/items'
import { LARGO, recortar } from '@/lib/limites'
import { comentariosDe, loadClaimViews, type CommentView } from '@/lib/lists'
import { iniciarRegaloGrupal, regalosDeItem, type RegaloView } from '@/lib/regalos'
import { recienHecho } from '@/lib/repetido'
import { pickItemFields, type OwnerItemView } from '@/lib/serialize'
import { newShareToken, urlFoto } from '@/lib/users'

// Sorpresa: un regalo para alguien que no está en su lista, y que se divide entre varios. Es una lista aparte (tipo
// sorpresa) con un solo deseo y su regalo grupal, que arma el que la carga; a los amigos que elige les llega la propuesta
// (ver invitarARegalo), como en "Lo dividimos". De ahí en más es un regalo grupal como cualquiera: Cuentas, Mis regalos.
// - Para alguien de GiftR: la ven todos los que le regalan con sesión, en su lista (ver sorpresasPara), así se suma más
//   gente y nadie le compra lo mismo. Él nunca: no es suya (no está en Mi lista ni en ninguna vista de dueño), y para lo
//   de la capa oculta cuenta como dueño (ver esOFueDuenoSql), así que no la abre, no se suma y no lo invitan.
// - Para una lista en común (Bauti): la ven los que le regalan, en esa lista. Los que la arman (o la armaron) nunca: es
//   como si la recibieran ellos (ver esOFueDuenoSql). La fecha es la de la lista.
// - Para alguien sin GiftR (la abuela): la ven el que la armó, los invitados y quien tenga el link.
// - Su link se abre solo con sesión (ver sorpresaParaViewer): sin sesión no se sabe quién mira, y puede ser el que la
//   recibe. Tampoco tiene vista previa que diga qué es (ver compartir.ts).
// - Si el que la armó cancela el regalo, la sorpresa se va (ver cancelarRegalo).

export type ParaSorpresa = {
  /** null: no usa GiftR, o es para una lista en común (esLista) */
  userId: string | null
  /** para una lista en común (Bauti): nombre es el de la lista y token, su link (si el que mira la sigue) */
  esLista: boolean
  nombre: string
  foto: string | null
  /** el link de su lista, solo si el que mira ya lo tiene (la sigue): una sorpresa no reparte el link de nadie */
  token: string | null
}

/**
 * A quién: con el link de su lista (se armó desde ahí; la de una persona o una en común), un amigo, o alguien sin GiftR (su
 * nombre y, si la saben, la fecha).
 */
export type ParaElegido = { token: string } | { amigo: string } | { nombre: string; fecha?: string | null }

export type SorpresaCreada = { ok: true; token: string } | { ok: false; reason: 'para' | 'deseo' }

/** El nombre de alguien sin GiftR, como se guarda; '' si no queda nada. */
const nombreDeAfuera = (escrito: string) => recortar(escrito, LARGO.paraSorpresa)

/** La fecha en que se la dan a alguien sin GiftR: una que existe y que no pasó; si no, null. */
const fechaQueViene = (f: string | null | undefined) =>
  f && fechaDeGrupoValida(f) && f >= hoyLocal().toISOString().slice(0, 10) ? f : null

type Destinatario = { paraUserId: string | null; paraListId: string | null; nombre: string | null; fecha: string | null }

async function destinatario(db: Db, creadorId: string, para: ParaElegido): Promise<Destinatario | null> {
  if ('token' in para) {
    if (!esToken(para.token)) return null
    const [l] = await db.select({ id: lists.id, tipo: lists.tipo, ownerId: lists.ownerId, nombre: lists.nombre }).from(lists)
      .where(and(eq(lists.shareToken, para.token), inArray(lists.tipo, ['personal', 'grupo'])))
    if (!l) return null
    if (l.tipo === 'personal') return l.ownerId && l.ownerId !== creadorId ? { paraUserId: l.ownerId, paraListId: null, nombre: null, fecha: null } : null
    // una lista en común: no si la arma (o la armó) el que la carga. El nombre de la lista queda en el de la sorpresa (para
    // quién, en Cuentas y en los avisos); la fecha es la de la lista (ver fechaDeLista)
    if (await esOFueDuenoDeLista(db, l.id, creadorId)) return null
    return { paraUserId: null, paraListId: l.id, nombre: l.nombre ?? 'Lista en común', fecha: null }
  }
  if ('amigo' in para) {
    const ok = esUuid(para.amigo) && para.amigo !== creadorId && (await misAmigos(db, creadorId)).has(para.amigo)
    return ok ? { paraUserId: para.amigo, paraListId: null, nombre: null, fecha: null } : null
  }
  const nombre = nombreDeAfuera(para.nombre ?? '')
  // una fecha que ya pasó no es para cuándo se la dan
  return nombre ? { paraUserId: null, paraListId: null, nombre, fecha: fechaQueViene(para.fecha) } : null
}

/**
 * Arma la sorpresa: la lista, el deseo, el regalo grupal (el que la carga queda de encargado) y la propuesta a los amigos
 * que eligió (los que no son sus amigos o son quien la recibe, no: ver invitarARegalo). Un doble toque no arma dos.
 */
export async function crearSorpresa(
  db: Db, creadorId: string, datos: { para: ParaElegido; deseo: NewItemData; invitar: string[] }, enviar?: Enviar,
): Promise<SorpresaCreada> {
  if (!esUuid(creadorId)) return { ok: false, reason: 'para' }
  const para = await destinatario(db, creadorId, datos.para)
  if (!para) return { ok: false, reason: 'para' }
  // uno solo, sin prioridad ni categoría: no es un deseo de nadie, es lo que le van a regalar
  const deseo = acotarDeseo({ ...datos.deseo, tipo: 'exacto' as const, cantidad: 1, repetible: false, prioridad: 'gustaria' as const, categoria: undefined })
  if (!deseo.titulo) return { ok: false, reason: 'deseo' }
  const hecha = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock del usuario, como crearGrupo: dos envíos a la vez no pasan juntos el chequeo de abajo
    await t.select({ id: users.id }).from(users).where(eq(users.id, creadorId)).for('update')
    const [repetida] = await t.select({ token: lists.shareToken }).from(lists).innerJoin(items, eq(items.listId, lists.id))
      .where(and(
        eq(lists.tipo, 'sorpresa'), eq(lists.creadaPor, creadorId), eq(items.titulo, deseo.titulo!), recienHecho(lists.createdAt),
        para.paraUserId ? eq(lists.paraUserId, para.paraUserId) : para.paraListId ? eq(lists.paraListId, para.paraListId) : eq(lists.nombre, para.nombre!),
      ))
    if (repetida) return { token: repetida.token, itemId: null }
    const [lista] = await t.insert(lists).values({
      tipo: 'sorpresa', shareToken: newShareToken(), paraUserId: para.paraUserId, paraListId: para.paraListId, creadaPor: creadorId,
      nombre: para.nombre, eventoFecha: para.fecha, eventoAnual: false,
    }).returning({ id: lists.id, token: lists.shareToken })
    const [item] = await t.insert(items).values({ ...deseo, titulo: deseo.titulo!, listId: lista.id }).returning({ id: items.id })
    return { token: lista.token, itemId: item.id }
  })
  if (!hecha.itemId) return { ok: true, token: hecha.token }
  const r = await iniciarRegaloGrupal(db, hecha.itemId, creadorId)
  if (!r.ok) {
    // no pasa (la lista es nueva y no es suya): sin regalo, no queda una sorpresa suelta
    await db.update(items).set({ estadoDueno: 'no_lo_quiero' }).where(eq(items.id, hecha.itemId))
    return { ok: false, reason: 'deseo' }
  }
  await invitarARegalo(db, r.giftId, creadorId, datos.invitar, enviar)
  return { ok: true, token: hecha.token }
}

export type SorpresaEnLista = {
  token: string
  titulo: string
  foto: string | null
  precio: string | null
  /** quién la organiza y quiénes están (el encargado primero) */
  encargado: string
  personas: string[]
  soyParte: boolean
  comprada: boolean
}

/**
 * Las sorpresas para alguien (o para una lista en común), para los que le regalan (en su lista): las que siguen abiertas
 * y las compradas para el evento que viene (lo de un cumple que ya pasó ya se regaló: está en Mis regalos). A él (o a los
 * que arman la lista), nunca.
 */
export async function sorpresasPara(db: Db, para: { userId: string } | { listId: string }, viewerId: string): Promise<SorpresaEnLista[]> {
  if ('userId' in para ? !esUuid(para.userId) || para.userId === viewerId : !esUuid(para.listId) || await esOFueDuenoDeLista(db, para.listId, viewerId)) {
    return []
  }
  const filas = await db.select({
    listId: lists.id, token: lists.shareToken, titulo: items.titulo, foto: items.fotoUrl, precio: items.precio,
    giftId: groupGifts.id, estado: groupGifts.estado, encargadoId: groupGifts.organizerUserId, compradoEl: claims.updatedAt,
  }).from(lists)
    .innerJoin(items, eq(items.listId, lists.id))
    .innerJoin(groupGifts, eq(groupGifts.itemId, items.id))
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .where(and(
      'userId' in para ? eq(lists.paraUserId, para.userId) : eq(lists.paraListId, para.listId), eq(lists.tipo, 'sorpresa'), eq(items.estadoDueno, 'activo'),
      inArray(groupGifts.estado, ['abierto', 'comprado']),
    ))
    .orderBy(desc(lists.createdAt))
  if (!filas.length) return []
  // todas cuentan desde el mismo evento: el cumple de quien las recibe, o la fecha de la lista (ver desdeElUltimoEvento)
  const desde = await desdeElUltimoEvento(db, filas[0].listId)
  const vigentes = filas.filter((f) => f.estado === 'abierto' || f.compradoEl >= desde)
  if (!vigentes.length) return []
  const gente = await db.select({ giftId: groupGiftMembers.giftId, userId: users.id, nombre: users.nombre }).from(groupGiftMembers)
    .innerJoin(users, eq(groupGiftMembers.userId, users.id))
    .where(inArray(groupGiftMembers.giftId, vigentes.map((f) => f.giftId)))
    .orderBy(asc(groupGiftMembers.createdAt))
  return vigentes.map((f) => {
    const suya = gente.filter((g) => g.giftId === f.giftId)
      .sort((a, b) => Number(b.userId === f.encargadoId) - Number(a.userId === f.encargadoId))
    return {
      token: f.token, titulo: f.titulo, foto: f.foto, precio: f.precio,
      encargado: suya.find((g) => g.userId === f.encargadoId)?.nombre ?? 'Alguien',
      personas: suya.map((g) => g.nombre), soyParte: suya.some((g) => g.userId === viewerId), comprada: f.estado === 'comprado',
    }
  })
}

export type VistaSorpresa =
  /** sin sesión no se muestra nada: puede ser el que la recibe */
  | { estado: 'sin_sesion' }
  /** el que la armó canceló el regalo */
  | { estado: 'cancelada'; para: ParaSorpresa }
  | {
    estado: 'abierta'
    token: string
    /** la armó el que mira: la puede editar */
    esCreador: boolean
    para: ParaSorpresa
    /** cuándo se la dan: el próximo cumple de quien la recibe, o la fecha que cargaron */
    fecha: { fecha: Date; dias: number } | null
    creador: string
    item: OwnerItemView
    regalos: RegaloView[]
    /** lo que anotó el encargado al comprarla */
    nota: string | null
    comments: CommentView[]
  }

async function paraDe(db: Db, list: typeof lists.$inferSelect, viewerId: string): Promise<ParaSorpresa> {
  if (list.paraListId) {
    // la lista en común: su nombre y su foto de hoy, y su link si el que mira la sigue
    const [l] = await db.select({ nombre: lists.nombre, foto: lists.fotoUrl, token: lists.shareToken, sigue: listFollows.userId }).from(lists)
      .leftJoin(listFollows, and(eq(listFollows.listId, lists.id), eq(listFollows.userId, viewerId)))
      .where(eq(lists.id, list.paraListId))
    return { userId: null, esLista: true, nombre: l?.nombre ?? list.nombre ?? 'Lista en común', foto: l?.foto ?? null, token: l?.sigue ? l.token : null }
  }
  if (!list.paraUserId) return { userId: null, esLista: false, nombre: list.nombre ?? 'Alguien', foto: null, token: null }
  const [[u], [suya]] = await Promise.all([
    db.select({ id: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, list.paraUserId)),
    db.select({ token: lists.shareToken }).from(lists)
      .innerJoin(listFollows, and(eq(listFollows.listId, lists.id), eq(listFollows.userId, viewerId)))
      .where(eq(lists.ownerId, list.paraUserId)),
  ])
  return { userId: u.id, esLista: false, nombre: u.nombre, foto: urlFoto(u), token: suya?.token ?? null }
}

/**
 * La sorpresa de un link, para quien mira. Null si no existe o si es para él (un 404, como cualquier link que no es nada).
 * Sin sesión, nada de lo que es.
 */
export async function sorpresaParaViewer(db: Db, token: string, viewer: Viewer): Promise<VistaSorpresa | null> {
  if (!esToken(token)) return null
  const [list] = await db.select().from(lists).where(and(eq(lists.shareToken, token), eq(lists.tipo, 'sorpresa')))
  if (!list) return null
  if (!viewer.userId) return { estado: 'sin_sesion' }
  // es para él, o para una lista en común que arma (o armó): como un link que no es nada
  if (viewer.userId === list.paraUserId || (list.paraListId && await esOFueDuenoDeLista(db, list.paraListId, viewer.userId))) return null
  const yo = { userId: viewer.userId }
  const [para, [item]] = await Promise.all([
    paraDe(db, list, viewer.userId),
    db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt)).limit(1),
  ])
  if (!item || item.estadoDueno !== 'activo') return { estado: 'cancelada', para }
  const [regalos, reservas, comments, creador, fecha] = await Promise.all([
    regalosDeItem(db, item.id, yo), loadClaimViews(db, list.id, [item], yo), comentariosDe(db, item.id),
    personas(db, list.creadaPor ? [list.creadaPor] : []), eventoDeLista(db, list.id),
  ])
  return {
    estado: 'abierta', token, esCreador: list.creadaPor === viewer.userId, para, creador: creador[0]?.nombre ?? 'Alguien',
    item: pickItemFields(item), regalos,
    nota: reservas.get(item.id)?.find((c) => c.grupal)?.notaQueCompre ?? null, comments,
    fecha: fecha && { fecha: fecha.fecha, dias: fecha.dias },
  }
}

/** La sorpresa de quien la armó, que sigue en pie, con su deseo. Null si no la armó, se canceló o no existe. */
async function deQuienLaArmo(db: Db, token: string, userId: string) {
  if (!esToken(token)) return null
  const [row] = await db.select({ list: lists, item: items }).from(lists).innerJoin(items, eq(items.listId, lists.id))
    .where(and(eq(lists.shareToken, token), eq(lists.tipo, 'sorpresa'), eq(lists.creadaPor, userId), eq(items.estadoDueno, 'activo')))
    .orderBy(asc(items.createdAt)).limit(1)
  return row ?? null
}

export type SorpresaParaEditar = { token: string; para: ParaSorpresa; deseo: OwnerItemView; fecha: string | null }

/** Para "Editar" la sorpresa: solo quien la armó, y mientras sigue en pie. */
export async function sorpresaParaEditar(db: Db, token: string, userId: string): Promise<SorpresaParaEditar | null> {
  const row = await deQuienLaArmo(db, token, userId)
  if (!row) return null
  return { token, para: await paraDe(db, row.list, userId), deseo: pickItemFields(row.item), fecha: row.list.eventoFecha }
}

/**
 * Quien la armó la edita: qué le regalan (nombre, foto, precio, detalles, link y video; sigue siendo uno solo) y, si es
 * para alguien sin GiftR, su nombre y la fecha (null la saca; undefined la deja). A los que están se les avisa si cambió
 * algo que les importa (ver cambiarDeseo), a él no. Para quién (alguien de GiftR o una lista en común) no cambia: sería
 * otra sorpresa.
 */
export async function editarSorpresa(
  db: Db, token: string, userId: string, datos: { deseo: CambiosDeseo; nombre?: string; fecha?: string | null },
): Promise<boolean> {
  const row = await deQuienLaArmo(db, token, userId)
  if (!row) return false
  if (!row.list.paraUserId && !row.list.paraListId && (datos.nombre !== undefined || datos.fecha !== undefined)) {
    const nombre = datos.nombre === undefined ? undefined : nombreDeAfuera(datos.nombre)
    if (nombre === '') return false
    await db.update(lists).set({
      ...(nombre !== undefined && { nombre }),
      ...(datos.fecha !== undefined && { eventoFecha: fechaQueViene(datos.fecha) }),
    }).where(eq(lists.id, row.list.id))
  }
  const { titulo, notas, fotoUrl, precio, linkTienda, videoUrl } = datos.deseo
  return cambiarDeseo(db, row.item.id, { titulo, notas, fotoUrl, precio, linkTienda, videoUrl }, userId)
}

/** Si el link es de una sorpresa (las páginas de /l/ la mandan a la suya). */
export async function esSorpresa(db: Db, token: string): Promise<boolean> {
  if (!esToken(token)) return false
  const [l] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.shareToken, token), eq(lists.tipo, 'sorpresa')))
  return !!l
}

/**
 * Para "¿Para quién?" desde una lista: de quién es ese link (una lista personal que no es la mía, o una en común que no
 * armo ni armé) y a quiénes no se les propone (el que la recibe, o los que arman la lista en común).
 */
export async function duenoDelLink(db: Db, token: string, viewerId: string): Promise<{ nombre: string; enComun: boolean; excluir: string[] } | null> {
  if (!esToken(token)) return null
  const [l] = await db.select({ id: lists.id, tipo: lists.tipo, nombre: lists.nombre, ownerId: lists.ownerId, dueno: users.nombre }).from(lists)
    .leftJoin(users, eq(lists.ownerId, users.id))
    .where(and(eq(lists.shareToken, token), inArray(lists.tipo, ['personal', 'grupo'])))
  if (!l) return null
  if (l.tipo === 'personal') return l.ownerId && l.dueno && l.ownerId !== viewerId ? { nombre: l.dueno, enComun: false, excluir: [l.ownerId] } : null
  if (await esOFueDuenoDeLista(db, l.id, viewerId)) return null
  const miembros = await db.select({ id: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, l.id))
  return { nombre: l.nombre ?? 'Lista en común', enComun: true, excluir: miembros.map((m) => m.id) }
}
