'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { items, lists } from '@/db/schema'
import { getViewer } from '@/lib/viewer'
import {
  anotarCuenta, CUENTAS_COOKIE, firmarInvitado, GUEST_COOKIE, leerInvitado, marcaNoSoy, NO_SOY_COOKIE, OPCIONES_COOKIE_INVITADO,
} from '@/lib/cookie-invitado'
import { auth, signIn, signOut } from '@/auth'
import { CAMPOS_OPCIONALES, createItem, archiveItem, deseoParaEditar, updateItem, type CambiosDeseo, type NewItemData } from '@/lib/items'
import { esUrlFotoDeseo } from '@/lib/fotos-deseo'
import { markBought, releaseClaim, reserveItem, tieneReservaActiva } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { createGuest, nombreDeViewer, unirInvitadoACuenta, validarNombre, viewerSinSesion, type NombreValidado } from '@/lib/guest'
import { abrirListaAInvitado } from '@/lib/acceso'
import { markNotificationsRead } from '@/lib/notifications'
import { crearGrupo, esUuid, fechaDeGrupoValida, nuevaInvitacion, sacarDelGrupo, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import { asegurarListaPropia } from '@/lib/users'
import { dejarDeSeguir, guardarCumple, guardarFechaGrupo } from '@/lib/events'
import { guardarGustos } from '@/lib/bienvenida'
import { avisar, borrarSuscripcion, guardarSuscripcion, mandarCodazo, marcarCodazosVistos } from '@/lib/codazos'
import { gustosDesdeForm } from '@/lib/gustos'
import { cancelarRegalo, comprarRegalo, iniciarRegaloGrupal, marcarPagado, parsePesos, salirDeRegalo, saldarCon, sumarseARegalo } from '@/lib/regalos'
import { identificado, type Viewer } from '@/lib/types'

/** Lo que devuelven los formularios que muestran un mensaje (con useActionState). */
export type EstadoForm = { error: string } | null

const str = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

const httpUrl = (v?: string) => (v && /^https?:\/\//i.test(v) ? v : undefined)

/** Solo rutas de la app ("/l/…"), nunca a otro sitio. */
const rutaPropia = (v?: string) => (v && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : '/')

async function listaDeToken(token: string): Promise<string | null> {
  const [row] = await db.select({ id: lists.id }).from(lists).where(eq(lists.shareToken, token))
  return row?.id ?? null
}

/** La lista del deseo, si el deseo es de la lista de ese token. */
async function listaDelItem(itemId: string, token: string): Promise<string | null> {
  const [row] = await db.select({ id: lists.id }).from(items)
    .innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), eq(lists.shareToken, token)))
  return row?.id ?? null
}

/** Adónde vuelve un formulario de una lista: la página de donde vino (con sus filtros), si es de esa misma lista. */
function volverALista(fd: FormData, token: string) {
  const v = rutaPropia(str(fd, 'volver'))
  const base = `/l/${token}`
  return v === base || v.startsWith(`${base}/`) || v.startsWith(`${base}?`) ? v : base
}

const conParametro = (ruta: string, clave: string, valor: string) => `${ruta}${ruta.includes('?') ? '&' : '?'}${clave}=${valor}`

/** Los campos del formulario de un deseo (agregar o editar). Lo vacío queda undefined. Null si falta el título. */
function deseoDelForm(formData: FormData): NewItemData | null {
  const titulo = str(formData, 'titulo')
  if (!titulo) return null
  const p = str(formData, 'prioridad')
  const cant = Math.trunc(Number(str(formData, 'cantidad') ?? '1'))
  const foto = str(formData, 'fotoUrl')
  return {
    tipo: str(formData, 'tipo') === 'idea' ? 'idea' : 'exacto',
    titulo,
    notas: str(formData, 'notas'),
    precio: str(formData, 'precio'),
    rangoPrecio: str(formData, 'rangoPrecio'),
    categoria: str(formData, 'categoria'),
    prioridad: p === 'mucho' || p === 'suelta' ? p : 'gustaria',
    cantidad: Number.isFinite(cant) && cant >= 1 ? cant : 1,
    repetible: formData.get('repetible') === 'on',
    linkTienda: httpUrl(str(formData, 'linkTienda')),
    // un link de foto o una foto subida desde el teléfono (/foto/deseo/:id)
    fotoUrl: httpUrl(foto) ?? (foto && esUrlFotoDeseo(foto) ? foto : undefined),
  }
}

export async function addItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const data = deseoDelForm(formData)
  if (!data) redirect('/agregar')
  // Sin listaId va a la lista personal; con listaId, a un grupo del que es dueño.
  const listaId = str(formData, 'listaId')
  const creado = await createItem(db, session.userId, data, listaId)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  redirect(listaId && creado ? `/grupos/${listaId}` : '/mi-lista')
}

export async function updateItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const itemId = str(formData, 'itemId') ?? ''
  const editable = await deseoParaEditar(db, itemId, session.userId)
  if (!editable) redirect('/mi-lista')
  const volver = editable.grupo ? `/grupos/${editable.grupo.id}` : '/mi-lista'
  const data = deseoDelForm(formData)
  if (!data) redirect(`/editar/${itemId}`)
  // Al editar, lo que quedó vacío se borra (al agregar, simplemente no se carga).
  const cambios: CambiosDeseo = { ...data }
  for (const campo of CAMPOS_OPCIONALES) cambios[campo] = data[campo] ?? null
  await updateItem(db, itemId, session.userId, cambios)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  revalidatePath('/l', 'layout')
  redirect(volver)
}

export async function archiveItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const estado = str(formData, 'estado') === 'no_lo_quiero' ? 'no_lo_quiero' : 'lo_tengo'
  await archiveItem(db, str(formData, 'itemId')!, session.userId, estado)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
}

export async function updatePriorityAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const p = str(formData, 'prioridad')
  if (p !== 'mucho' && p !== 'gustaria' && p !== 'suelta') return
  await updateItem(db, str(formData, 'itemId')!, session.userId, { prioridad: p })
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
}

export async function createGroupAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const nombre = str(formData, 'nombre')
  if (!nombre) redirect('/grupos/nuevo')
  const fecha = str(formData, 'fecha')
  // Una fecha que no existe (un navegador sin calendario, un pedido armado) no frena el grupo: se crea sin fecha y la
  // pantalla del grupo avisa, con la fecha abierta para elegir otra. Todo en un alta: nunca queda un grupo a medias.
  const id = await crearGrupo(db, session.userId, {
    nombre: nombre.slice(0, 60), descripcion: str(formData, 'descripcion')?.slice(0, 120),
    eventoFecha: fecha, eventoAnual: formData.get('anual') === 'on',
  })
  revalidatePath('/mi-lista')
  revalidatePath('/eventos')
  redirect(fecha && !fechaDeGrupoValida(fecha) ? `/grupos/${id}?fecha=invalida` : `/grupos/${id}`)
}

export async function setGroupDateAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const id = str(formData, 'grupoId') ?? ''
  if (!esUuid(id)) return
  const fecha = formData.get('quitar') ? null : str(formData, 'fecha') ?? null
  if (fecha !== null && !fechaDeGrupoValida(fecha)) redirect(`/grupos/${id}?fecha=invalida`)
  await guardarFechaGrupo(db, id, session.userId, fecha, formData.get('anual') === 'on')
  revalidatePath(`/grupos/${id}`)
  revalidatePath('/eventos')
  // sin el aviso de una fecha inválida anterior, si quedó en la dirección
  redirect(`/grupos/${id}`)
}

const numero = (fd: FormData, k: string) => { const v = Number(str(fd, k)); return Number.isInteger(v) && v > 0 ? v : null }

export async function saveBirthdayAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await guardarCumple(db, session.userId, numero(formData, 'dia'), numero(formData, 'mes'))
  revalidatePath('/perfil')
  revalidatePath('/eventos')
}

/** Bienvenida (o editar gustos desde Perfil): guarda lo elegido, aunque se corte a mitad de camino. */
export async function saveGustosAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await guardarGustos(db, session.userId, gustosDesdeForm(formData))
  if (formData.has('dia')) await guardarCumple(db, session.userId, numero(formData, 'dia'), numero(formData, 'mes'))
  revalidatePath('/perfil')
  revalidatePath('/eventos')
  revalidatePath('/mi-lista')
  const desdePerfil = str(formData, 'volver') === 'perfil'
  if (formData.has('corte')) redirect(desdePerfil ? '/perfil' : '/mi-lista')
  redirect(desdePerfil ? '/bienvenida/listo?desde=perfil' : '/bienvenida/listo')
}

export async function joinGroupAction(formData: FormData) {
  const invite = str(formData, 'invite') ?? ''
  const session = await auth()
  if (!session?.userId) redirect(`/grupos/unirme/${invite}`)
  const id = await unirseAGrupo(db, invite, session.userId)
  if (!id) redirect('/mi-lista')
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  redirect(`/grupos/${id}`)
}

export async function leaveGroupAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await salirDeGrupo(db, str(formData, 'grupoId') ?? '', session.userId)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  redirect('/mi-lista')
}

/** "Se sumó por error": un dueño saca a alguien que se sumó después que él (deja de editar y sigue ciego) y cambia la invitación. */
export async function removeMemberAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const id = str(formData, 'grupoId') ?? ''
  const sacado = await sacarDelGrupo(db, id, session.userId, str(formData, 'userId') ?? '')
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  if (sacado) redirect(`/grupos/${id}?nuevo=sacado`)
}

/** "Generar un link de invitación nuevo": el anterior deja de servir para sumarse al grupo. */
export async function newInviteAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const id = str(formData, 'grupoId') ?? ''
  const nuevo = await nuevaInvitacion(db, id, session.userId)
  revalidatePath(`/grupos/${id}`)
  if (nuevo) redirect(`/grupos/${id}?nuevo=invitacion`)
}

/**
 * "Cambiar el link para regalar" de la lista personal (desde Perfil) o de un grupo (con grupoId): el anterior deja de
 * andar y hay que volver a compartirlo.
 */
export async function newShareLinkAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const grupoId = str(formData, 'grupoId')
  const listId = grupoId ?? (await asegurarListaPropia(db, session.userId))?.id
  const nuevo = listId ? await cambiarLinkParaRegalar(db, listId, session.userId) : null
  revalidatePath('/mi-lista')
  revalidatePath('/perfil')
  revalidatePath('/grupos', 'layout')
  revalidatePath('/l', 'layout')
  if (nuevo) redirect(grupoId ? `/grupos/${grupoId}?nuevo=regalar` : '/perfil?nuevo=regalar')
}

/** Saca una lista de Tu gente (y su cumple o fecha de Eventos). */
export async function unfollowAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await dejarDeSeguir(db, session.userId, str(formData, 'listId') ?? '')
  revalidatePath('/gente')
  revalidatePath('/eventos')
}

/**
 * El que mira. Si no se sabe quién es y el formulario trae un nombre, lo anota como invitado
 * (con la cookie firmada). Un nombre vacío o muy largo vuelve con el motivo, para mostrárselo.
 * Anotarse con su nombre en una lista es decir que no es suya: ve lo que reservaron los demás ahí (y solo ahí).
 */
async function viewerIdentificandoGuest(formData: FormData, listId: string): Promise<{ ok: true; viewer: Viewer } | Extract<NombreValidado, { ok: false }>> {
  const viewer = await getViewer()
  if (identificado(viewer) || !formData.has('nombre')) return { ok: true, viewer }
  const v = validarNombre(formData.get('nombre'))
  if (!v.ok) return v
  const guest = await createGuest(db, v.nombre)
  await abrirListaAInvitado(db, guest.id, listId)
  const jar = await cookies()
  jar.set(GUEST_COOKIE, firmarInvitado(guest.id), OPCIONES_COOKIE_INVITADO)
  // con las cuentas que tuvieron sesión acá: en sus listas, este invitado nuevo tampoco ve nada
  return { ok: true, viewer: viewerSinSesion(guest.id, jar.get(CUENTAS_COOKIE)?.value) }
}

export async function reserveAction(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const token = str(formData, 'token') ?? ''
  const itemId = str(formData, 'itemId') ?? ''
  const listId = await listaDelItem(itemId, token)
  if (!listId) return null
  const quien = await viewerIdentificandoGuest(formData, listId)
  if (!quien.ok) return { error: quien.error }
  const r = await reserveItem(db, itemId, quien.viewer)
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${itemId}`)
  const volver = volverALista(formData, token)
  // Un doble toque manda el segundo envío con la reserva del primero ya hecha: no hay que decirle que lo agarró otro.
  if (r.ok || (r.reason === 'sin_stock' && await tieneReservaActiva(db, itemId, quien.viewer))) {
    // si arriba quedó el cartel de una reserva anterior que no salió (?reserva=), se va
    if (str(formData, 'conCartel')) redirect(volver)
    return null
  }
  // Por qué no se pudo va en la página (?reserva=…), no en el formulario: al recargar, ese deseo ya no tiene
  // el botón (lo agarró otro, o recién ahora se ven los estados) y el mensaje se iría con él.
  // Se vuelve a la misma página, con sus filtros; del detalle, a la lista si el deseo ya no está.
  const sigue = r.reason === 'sin_stock' || r.reason === 'sin_identidad'
  redirect(conParametro(sigue || !volver.startsWith(`/l/${token}/item/`) ? volver : `/l/${token}`, 'reserva', r.reason))
}

/** "¿Quién sos?" arriba de una lista: se anota con su nombre (sin reservar nada) y pasa a ver la coordinación. */
export async function identificarseAction(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const token = str(formData, 'token') ?? ''
  const listId = await listaDeToken(token)
  if (!listId) return null
  const quien = await viewerIdentificandoGuest(formData, listId)
  if (!quien.ok) return { error: quien.error }
  revalidatePath(`/l/${token}`, 'layout')
  return null
}

/** "No es mía: ver lo reservado": un invitado que se anotó en otra lista dice que esta tampoco es suya. */
export async function verLoReservadoAction(formData: FormData) {
  const token = str(formData, 'token') ?? ''
  const [listId, viewer] = await Promise.all([listaDeToken(token), getViewer()])
  if (!listId || !viewer.guestId) return
  await abrirListaAInvitado(db, viewer.guestId, listId)
  revalidatePath(`/l/${token}`, 'layout')
}

/** "Entrar con Google" desde una lista o un deseo: vuelve a la misma página. */
export async function entrarConGoogleAction(formData: FormData) {
  await signIn('google', { redirectTo: rutaPropia(str(formData, 'volver')) })
}

/**
 * "Cerrar sesión" (Perfil) o "¿No sos X?" (en una lista): este navegador se olvida del que está ahora.
 * Con sesión de Google, la cierra y nada más: la cookie de un invitado que no se unió a la cuenta es de otra persona
 * (o de la misma, que todavía no dijo que era ella) y borrarla dejaría sus reservas sin nadie que las maneje.
 * Queda anotado que esta cuenta usó el navegador: en sus listas, ese invitado ya no ve la capa oculta.
 * Sin sesión, borra la cookie de invitado (la pantalla pide confirmarlo antes).
 */
export async function salirAction(formData: FormData) {
  const volver = rutaPropia(str(formData, 'volver'))
  const session = await auth()
  if (session?.userId) {
    anotarCuenta(await cookies(), session.userId)
    await signOut({ redirectTo: volver })
    return
  }
  const jar = await cookies()
  jar.delete(GUEST_COOKIE)
  jar.delete(NO_SOY_COOKIE)
  revalidatePath(volver, 'layout')
  redirect(volver)
}

/** "Sí, soy yo": el invitado de este navegador se une a la cuenta (sus reservas, comentarios y avisos pasan a ella). */
export async function unirInvitadoAction() {
  const session = await auth()
  if (!session?.userId) return
  const jar = await cookies()
  anotarCuenta(jar, session.userId)
  const guestId = leerInvitado(jar.get(GUEST_COOKIE)?.value)
  // si falla, la cookie queda y la pregunta sigue ahí para volver a intentar
  if (guestId) await unirInvitadoACuenta(db, guestId, session.userId)
  jar.delete(GUEST_COOKIE)
  jar.delete(NO_SOY_COOKIE)
  revalidatePath('/', 'layout')
}

/** "No soy yo": el invitado queda como estaba (es de otra persona que usa este navegador) y no se pregunta más. */
export async function noSoyElInvitadoAction() {
  const session = await auth()
  if (!session?.userId) return
  const jar = await cookies()
  // la cookie del invitado sigue, pero en las listas de esta cuenta ya no ve nada (puede ser ella, después de salir)
  anotarCuenta(jar, session.userId)
  const guestId = leerInvitado(jar.get(GUEST_COOKIE)?.value)
  if (guestId) jar.set(NO_SOY_COOKIE, marcaNoSoy(guestId, session.userId), OPCIONES_COOKIE_INVITADO)
  revalidatePath('/', 'layout')
}

export async function boughtAction(formData: FormData) {
  const viewer = await getViewer()
  const token = str(formData, 'token')!
  await markBought(db, str(formData, 'claimId')!, viewer, str(formData, 'nota'))
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${str(formData, 'itemId')}`)
}

export async function releaseAction(formData: FormData) {
  const viewer = await getViewer()
  const token = str(formData, 'token')!
  await releaseClaim(db, str(formData, 'claimId')!, viewer)
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${str(formData, 'itemId')}`)
}

export async function commentAction(formData: FormData) {
  const viewer = await getViewer()
  const token = str(formData, 'token')!
  const itemId = str(formData, 'itemId')!
  if (!(await listaDelItem(itemId, token))) return
  await addComment(db, itemId, viewer, str(formData, 'texto') ?? '')
  revalidatePath(`/l/${token}/item/${itemId}`)
}

export async function markNotifsReadAction() {
  await markNotificationsRead(db, await getViewer())
  revalidatePath('/', 'layout')
}

// ---------- Regalo grupal y cuentas (solo con cuenta de Google: las deudas tienen que tener dueño) ----------

async function usuarioRegalador() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  return session.userId
}

function revalidarRegalo(fd: FormData) {
  const token = str(fd, 'token')
  const itemId = str(fd, 'itemId')
  if (token) revalidatePath(`/l/${token}`)
  if (token && itemId) revalidatePath(`/l/${token}/item/${itemId}`)
  revalidatePath('/cuentas')
  revalidatePath('/perfil')
  revalidatePath('/eventos')
}

export async function startGroupGiftAction(formData: FormData) {
  const userId = await usuarioRegalador()
  const token = str(formData, 'token') ?? ''
  const itemId = str(formData, 'itemId') ?? ''
  if (!(await listaDelItem(itemId, token))) return
  await iniciarRegaloGrupal(db, itemId, userId)
  revalidarRegalo(formData)
}

export async function joinGroupGiftAction(formData: FormData) {
  await sumarseARegalo(db, str(formData, 'giftId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

export async function leaveGroupGiftAction(formData: FormData) {
  await salirDeRegalo(db, str(formData, 'giftId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

export async function cancelGroupGiftAction(formData: FormData) {
  await cancelarRegalo(db, str(formData, 'giftId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

/** "0" es una parte válida (alguien que no pone); cualquier otra cosa se lee como pesos. */
const parte = (v: string) => (/^\D*0+\D*$/.test(v) ? 0 : parsePesos(v) ?? Number.NaN)

export async function buyGroupGiftAction(formData: FormData) {
  const userId = await usuarioRegalador()
  const [token, itemId, giftId] = [str(formData, 'token'), str(formData, 'itemId'), str(formData, 'giftId') ?? '']
  // desde Cuentas (sin el link de la lista) vuelve ahí, con el error en el regalo que lo tuvo
  const enDeseo = token && itemId ? `/l/${token}/item/${itemId}` : null
  let partes: Record<string, number> | undefined
  if (str(formData, 'modo') === 'manual') {
    partes = {}
    for (const [k, v] of formData.entries()) {
      if (k.startsWith('parte:') && typeof v === 'string') partes[k.slice(6)] = parte(v)
    }
  }
  const r = await comprarRegalo(db, giftId, userId, {
    total: parsePesos(str(formData, 'total')) ?? 0, partes, nota: str(formData, 'nota'),
  })
  revalidarRegalo(formData)
  if (r.ok) redirect(enDeseo ?? '/cuentas')
  redirect(enDeseo ? `${enDeseo}?error=${r.reason}` : `/cuentas?error=${r.reason}&regalo=${encodeURIComponent(giftId)}`)
}

export async function markPaidAction(formData: FormData) {
  const userId = await usuarioRegalador()
  await marcarPagado(db, str(formData, 'giftId') ?? '', str(formData, 'deudorId') ?? '', userId, str(formData, 'pagado') !== '0')
  revalidarRegalo(formData)
}

export async function settleUpAction(formData: FormData) {
  await saldarCon(db, await usuarioRegalador(), str(formData, 'otroId') ?? '')
  revalidarRegalo(formData)
}

// ---------- Avisos push y codazos ----------

export async function suscribirAvisosAction(suscripcion: unknown): Promise<boolean> {
  const session = await auth()
  if (!session?.userId) return false
  return guardarSuscripcion(db, session.userId, suscripcion)
}

export async function desuscribirAvisosAction(endpoint: string) {
  const session = await auth()
  if (session?.userId) await borrarSuscripcion(db, session.userId, endpoint)
}

/** Un aviso de prueba a los dispositivos de uno mismo. Devuelve a cuántos llegó. */
export async function probarAvisoAction(): Promise<number> {
  const session = await auth()
  if (!session?.userId) return 0
  return avisar(db, session.userId, { title: '👉 Así llega un codazo', body: 'Cuando alguien quiera saber qué regalarte, te avisamos acá.', url: '/mi-lista' })
}

export async function codazoAction(formData: FormData) {
  const token = str(formData, 'token') ?? ''
  // antes de anotar a nadie: un token inventado no crea invitados
  const listId = await listaDeToken(token)
  if (!listId) redirect('/')
  const quien = await viewerIdentificandoGuest(formData, listId)
  if (!quien.ok) redirect(`/l/${token}?codazo=${quien.motivo === 'vacio' ? 'sin_identidad' : 'nombre_largo'}#codazo`)
  const r = await mandarCodazo(db, token, quien.viewer, (await nombreDeViewer(db, quien.viewer)) ?? 'Alguien')
  redirect(`/l/${token}?codazo=${r.ok ? (r.avisados ? 'avisado' : 'cartel') : r.reason}#codazo`)
}

export async function vistoCodazosAction() {
  const session = await auth()
  if (!session?.userId) return
  await marcarCodazosVistos(db, session.userId)
  revalidatePath('/', 'layout')
}
