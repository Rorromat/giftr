'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { items, lists } from '@/db/schema'
import { getViewer } from '@/lib/viewer'
import {
  anotarCuenta, cuentaAnotada, CUENTAS_COOKIE, firmarInvitado, GUEST_COOKIE, leerInvitado, NO_SOY_COOKIE,
  OPCIONES_COOKIE_INVITADO, renovarCuentas, sumarNoSoy,
} from '@/lib/cookie-invitado'
import { auth, signIn, signOut } from '@/auth'
import { createItem, archiveItem, deseoParaEditar, restoreItem, updateItem } from '@/lib/items'
import { deseoDesdeForm, paraAgregar } from '@/lib/deseo-form'
import { desmarcarComprado, markBought, releaseClaim, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { createGuest, nombreDeViewer, unirInvitadoACuenta, validarNombre, viewerSinSesion, type NombreValidado } from '@/lib/guest'
import { abrirListaAInvitado } from '@/lib/acceso'
import { markNotificationsRead } from '@/lib/notifications'
import { crearGrupo, esToken, esUuid, fechaDeGrupoValida, nuevaInvitacion, sacarDelGrupo, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import { asegurarListaPropia, existeUsuario } from '@/lib/users'
import { dejarDeSeguir, guardarCumple, guardarFechaGrupo } from '@/lib/events'
import { guardarGustos } from '@/lib/bienvenida'
import { borrarSuscripcion, confirmarSuscripcion, guardarSuscripcion, mandarCodazo, marcarCodazosVistos, probarAviso } from '@/lib/codazos'
import { gustosDesdeForm } from '@/lib/gustos'
import {
  aceptarLinkDeAmigo, buscarPorUsuario, cambiarUsuario, cancelarSolicitud, dejarDeSerAmigos, normalizarEmail, pedirAmistad,
  pedirAmistadPorMail, responderSolicitud,
} from '@/lib/amigos'
import {
  cancelarRegalo, comprarRegalo, corregirCompra, dejarVolverARegalo, iniciarRegaloGrupal, marcarPagado, posponerRecordatorio, sacarDeRegalo,
  salirDeRegalo, saldarCon, sumarseARegalo, type CompraResult, type DatosCompra,
} from '@/lib/regalos'
import { parsePesos, partePesos, pesos } from '@/lib/pesos'
import { identificado, type Viewer } from '@/lib/types'
import { LARGO, recortar } from '@/lib/limites'

/** Lo que devuelven los formularios que muestran un mensaje (con useActionState). */
export type EstadoForm = { error: string } | null

const str = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Un número entero de un campo oculto (lo que mostraba la pantalla); si no vino, undefined. */
const entero = (fd: FormData, k: string) => {
  const v = str(fd, k)
  return v && /^-?\d{1,12}$/.test(v) ? Number(v) : undefined
}

/** Solo rutas de la app ("/l/…"), nunca a otro sitio. */
const rutaPropia = (v?: string) => (v && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : '/')

/** La lista del link para regalar. Un token que no puede ser (armado a mano, con un \u0000) no es de ninguna. */
async function listaDeToken(token: string): Promise<string | null> {
  if (!esToken(token)) return null
  const [row] = await db.select({ id: lists.id }).from(lists).where(eq(lists.shareToken, token))
  return row?.id ?? null
}

/** La lista del deseo, si el deseo es de la lista de ese token. Un id que no es de un deseo no es de ninguna. */
async function listaDelItem(itemId: string, token: string): Promise<string | null> {
  if (!esUuid(itemId) || !esToken(token)) return null
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

export async function addItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const data = deseoDesdeForm(formData, true)
  if (!data) redirect('/agregar')
  // Sin listaId va a la lista personal; con listaId, a un grupo del que es dueño.
  const listaId = str(formData, 'listaId')
  const creado = await createItem(db, session.userId, paraAgregar(data), listaId)
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
  const data = deseoDesdeForm(formData)
  if (!data) redirect(`/editar/${itemId}`)
  // Al editar, lo que quedó vacío se borra; un link que no es link deja el que había (ver deseoDesdeForm).
  await updateItem(db, itemId, session.userId, data)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  revalidatePath('/l', 'layout')
  // vuelve a verlo, con los cambios
  redirect(`/deseo/${itemId}`)
}

export async function archiveItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const estado = str(formData, 'estado') === 'no_lo_quiero' ? 'no_lo_quiero' : 'lo_tengo'
  await archiveItem(db, str(formData, 'itemId') ?? '', session.userId, estado)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  revalidatePath('/l', 'layout')
  // desde la pantalla del deseo, que archivado ya no se abre, vuelve a su lista
  const volver = str(formData, 'volver')
  if (volver) redirect(rutaPropia(volver))
}

/** "Volver a mi lista" desde Archivados. */
export async function restoreItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await restoreItem(db, str(formData, 'itemId') ?? '', session.userId)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  revalidatePath('/l', 'layout')
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
  const nombre = recortar(str(formData, 'nombre') ?? '', LARGO.nombreGrupo)
  if (!nombre) redirect('/grupos/nuevo')
  const fecha = str(formData, 'fecha')
  // Una fecha que no existe (un navegador sin calendario, un pedido armado) no frena el grupo: se crea sin fecha y la
  // pantalla del grupo avisa, con la fecha abierta para elegir otra. Todo en un alta: nunca queda un grupo a medias.
  const id = await crearGrupo(db, session.userId, {
    nombre, descripcion: recortar(str(formData, 'descripcion') ?? '', LARGO.descripcionGrupo) || undefined,
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

/**
 * "Tu cumple" en Perfil. Se borra solo con "Quitar": un envío con los campos vacíos (un segundo "Guardar" después de que el
 * formulario volvió a como estaba) no lo borra. Si falta el día o el mes, o la fecha no existe, vuelve con el aviso
 * (antes no se guardaba y no decía nada).
 */
export async function saveBirthdayAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [dia, mes] = [numero(formData, 'dia'), numero(formData, 'mes')]
  const ok = formData.get('quitar')
    ? await guardarCumple(db, session.userId, null, null)
    : dia !== null && mes !== null && await guardarCumple(db, session.userId, dia, mes)
  revalidatePath('/perfil')
  revalidatePath('/eventos')
  if (!ok) redirect('/perfil?cumple=invalido#cumple')
  // si arriba quedó el aviso de un intento anterior, se va
  if (str(formData, 'conAviso')) redirect('/perfil#cumple')
}

/** Bienvenida (o editar gustos desde Perfil): guarda lo elegido, aunque se corte a mitad de camino. */
export async function saveGustosAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await guardarGustos(db, session.userId, gustosDesdeForm(formData))
  // los dos vacíos lo borran (los campos vienen con el cumple guardado); uno sin el otro, o uno que no existe, no se guarda
  const cumpleOk = !formData.has('dia') || await guardarCumple(db, session.userId, numero(formData, 'dia'), numero(formData, 'mes'))
  revalidatePath('/perfil')
  revalidatePath('/eventos')
  revalidatePath('/mi-lista')
  const desdePerfil = str(formData, 'volver') === 'perfil'
  const corte = formData.has('corte')
  // Lo demás ya se guardó: vuelve al primer paso a avisar, en vez de seguir como si el cumple estuviera. Con "Más tarde"
  // (o "Guardar" desde Perfil) quería salir: va a Perfil, que avisa al lado de su cumple, en vez de dejarlo adentro.
  if (!cumpleOk) redirect(corte ? '/perfil?cumple=invalido#cumple' : `/bienvenida?${desdePerfil ? 'editar=1&' : ''}paso=0&cumple=invalido`)
  if (corte) redirect(desdePerfil ? '/perfil' : '/mi-lista')
  redirect(desdePerfil ? '/bienvenida/listo?desde=perfil' : '/bienvenida/listo')
}

export async function joinGroupAction(formData: FormData) {
  const invite = str(formData, 'invite') ?? ''
  // una invitación que no puede ser no es de ningún grupo (y no se arma una dirección con lo que vino)
  if (!esToken(invite)) redirect('/mi-lista')
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
  // las cuentas anotadas duran desde ahora, como la cookie nueva: si vencieran antes, la dueña sin su sesión volvería a
  // ver como regaladora la lista que este invitado abrió
  renovarCuentas(jar)
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
  // Un doble toque manda el segundo envío con la reserva del primero ya hecha: reserveItem le devuelve esa.
  if (r.ok) {
    // si arriba quedó el cartel de una reserva anterior que no salió (?reserva=), se va
    if (str(formData, 'conCartel')) redirect(volver)
    return null
  }
  // Por qué no se pudo va en la página (?reserva=…), no en el formulario: al recargar, ese deseo ya no tiene
  // el botón (lo agarró otro, o recién ahora se ven los estados) y el mensaje se iría con él.
  // Se vuelve a la misma página, con sus filtros; del detalle, a la lista si el deseo ya no está.
  const sigue = r.reason === 'sin_stock' || r.reason === 'sin_identidad' || r.reason === 'muchas'
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
 * Sin sesión (o con la de un usuario que ya no existe), borra la cookie de invitado (la pantalla pide confirmarlo antes).
 */
export async function salirAction(formData: FormData) {
  const volver = rutaPropia(str(formData, 'volver'))
  const [session, jar] = await Promise.all([auth(), cookies()])
  if (session?.userId) {
    if (await existeUsuario(db, session.userId)) anotarCuenta(jar, session.userId)
    else {
      // la sesión de un usuario que ya no está en la base: la pantalla lo mostraba como el invitado (ver getViewer) y
      // le ofrecía "Salir igual"; si solo se cerrara la sesión vieja, el primer toque parecería no hacer nada
      jar.delete(GUEST_COOKIE)
      jar.delete(NO_SOY_COOKIE)
    }
    await signOut({ redirectTo: volver })
    return
  }
  jar.delete(GUEST_COOKIE)
  jar.delete(NO_SOY_COOKIE)
  revalidatePath(volver, 'layout')
  redirect(volver)
}

/**
 * Al abrir la app con una sesión que todavía no está anotada en este navegador (la de antes de que se anotaran, que
 * nunca pasó por el login de ahora): se anota, así cuando venza la sesión sus listas siguen protegidas (ver accesoALista).
 */
export async function anotarCuentaAction() {
  const session = await auth()
  if (!session?.userId) return
  const jar = await cookies()
  if (!cuentaAnotada(jar, session.userId)) anotarCuenta(jar, session.userId)
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
  if (guestId) jar.set(NO_SOY_COOKIE, sumarNoSoy(jar.get(NO_SOY_COOKIE)?.value, guestId, session.userId), OPCIONES_COOKIE_INVITADO)
  revalidatePath('/', 'layout')
}

/**
 * Lo que cambió una reserva. Sin token viene del cartel "¿Conseguiste…?" de alguien que no tiene el link de ahora (está en
 * Mi lista, en el grupo o en otra lista): que el cartel se vaya donde esté.
 */
function revalidarReserva(token: string, itemId: string) {
  if (!token) return revalidatePath('/', 'layout')
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${itemId}`)
}

export async function boughtAction(formData: FormData) {
  const viewer = await getViewer()
  const [token, itemId] = [str(formData, 'token') ?? '', str(formData, 'itemId') ?? '']
  // Volver a reservar una que venció pide lo mismo que reservar: el deseo, con el link para regalar de ahora (ver markBought).
  const conLink = esUuid(itemId) && !!(await listaDelItem(itemId, token))
  const r = await markBought(db, str(formData, 'claimId') ?? '', viewer, str(formData, 'nota'), conLink ? itemId : undefined)
  revalidarReserva(token, itemId)
  // la reserva había vencido y el lugar ya lo tomó otro: que se entere, en vez de que no pase nada
  if (!r.ok && r.reason === 'sin_lugar') redirect(`/l/${token}/item/${itemId}?reserva=vencida`)
}

/** "Me equivoqué, no lo compré": la compra suelta vuelve a ser una reserva (si no tiene ya el tope de reservas en la lista). */
export async function unboughtAction(formData: FormData) {
  const viewer = await getViewer()
  const [token, itemId] = [str(formData, 'token') ?? '', str(formData, 'itemId') ?? '']
  const r = await desmarcarComprado(db, str(formData, 'claimId') ?? '', viewer)
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${itemId}`)
  if (!r.ok && r.reason === 'muchas' && (await listaDelItem(itemId, token))) redirect(`/l/${token}/item/${itemId}?reserva=muchas_deshacer`)
}

export async function releaseAction(formData: FormData) {
  const viewer = await getViewer()
  await releaseClaim(db, str(formData, 'claimId') ?? '', viewer)
  revalidarReserva(str(formData, 'token') ?? '', str(formData, 'itemId') ?? '')
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
  const r = await iniciarRegaloGrupal(db, itemId, userId)
  revalidarRegalo(formData)
  // un regalo en el que está solo cuenta para el tope de reservas (ver tomadasEnLista): que sepa por qué no se armó
  if (!r.ok && r.reason === 'muchas') redirect(`/l/${token}/item/${itemId}?reserva=muchas`)
}

export async function joinGroupGiftAction(formData: FormData) {
  const userId = await usuarioRegalador()
  // Pide lo mismo que armar uno: el deseo, con el link para regalar de ahora (y el regalo, de ese deseo). Si no, a quien le
  // cambiaron el link para sacarle la lista se sumaría desde la página que le quedó abierta.
  const itemId = str(formData, 'itemId') ?? ''
  if (!(await listaDelItem(itemId, str(formData, 'token') ?? ''))) return
  await sumarseARegalo(db, str(formData, 'giftId') ?? '', userId, itemId)
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

/** "Sacar" a alguien del regalo: solo el encargado (el de la sesión, nunca uno que venga en el formulario). */
export async function removeGroupGiftMemberAction(formData: FormData) {
  await sacarDeRegalo(db, str(formData, 'giftId') ?? '', str(formData, 'miembroId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

/** "Dejar que vuelva" a alguien que sacó: también solo el encargado de la sesión. */
export async function letBackGroupGiftMemberAction(formData: FormData) {
  await dejarVolverARegalo(db, str(formData, 'giftId') ?? '', str(formData, 'miembroId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

/** "Sigue en pie" en el recordatorio de cerrar un regalo abierto. */
export async function postponeGroupGiftReminderAction(formData: FormData) {
  await posponerRecordatorio(db, str(formData, 'giftId') ?? '', await usuarioRegalador())
  revalidatePath('/', 'layout')
}

/** Lo que manda CompraGrupalForm: el total, con quiénes vio la división el encargado y, "A mano", la parte de cada uno. */
function compraDesdeForm(formData: FormData): DatosCompra {
  let partes: Record<string, number> | undefined
  if (str(formData, 'modo') === 'manual') {
    partes = {}
    // vacía o en 0 es que no pone, igual que en la pantalla (ver partePesos)
    for (const [k, v] of formData.entries()) {
      if (k.startsWith('parte:') && typeof v === 'string') partes[k.slice(6)] = partePesos(v) ?? Number.NaN
    }
  }
  return {
    total: parsePesos(str(formData, 'total')) ?? 0,
    miembros: formData.getAll('miembro').filter((v): v is string => typeof v === 'string'),
    partes, nota: str(formData, 'nota'),
  }
}

const ERRORES_COMPRA = {
  monto_invalido: 'Revisá los montos: tienen que ser pesos. Si alguien no pone, dejá su parte vacía o en 0.',
  cambiaron: 'Se sumó o se bajó alguien, revisá la división.',
  ya_pagaron: 'Alguien ya figura como que te pagó: para corregir, primero deshacé ese pago.',
  nada_que_corregir: 'Ya nadie te debe nada de este regalo: no hay nada que corregir.',
  no_permitido: 'No se pudo: puede que ya se haya comprado o cancelado. Recargá la página.',
}

/** Qué no cierra, para el formulario: con las partes, cuánto falta o cuánto sobra. */
function errorDeCompra(r: Exclude<CompraResult, { ok: true }>, p: DatosCompra): string {
  if (r.reason === 'de_la_lista') {
    return `${r.nombre} se sumó al grupo después de la compra y ya no ve este regalo: su parte no se puede cambiar. Corregilo "A mano" dejándole ${pesos(r.monto)}.`
  }
  if (r.reason !== 'no_suma') return ERRORES_COMPRA[r.reason]
  const suma = Object.values(p.partes ?? {}).reduce((a, b) => a + b, 0)
  return suma < p.total
    ? `Las partes suman ${pesos(suma)}: faltan ${pesos(p.total - suma)} para llegar a ${pesos(p.total)}.`
    : `Las partes suman ${pesos(suma)}: te pasaste ${pesos(suma - p.total)} de ${pesos(p.total)}.`
}

/**
 * "Lo compré" (en el deseo o desde Cuentas). Si no sale, el mensaje va en el formulario, que se queda con lo cargado; la
 * página se vuelve a armar igual (si se sumó alguien, ya aparece en la división).
 */
export async function buyGroupGiftAction(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const p = compraDesdeForm(formData)
  const r = await comprarRegalo(db, str(formData, 'giftId') ?? '', await usuarioRegalador(), p)
  revalidarRegalo(formData)
  return r.ok ? null : { error: errorDeCompra(r, p) }
}

/**
 * "Corregir la compra": lo mismo, sobre un regalo ya comprado que nadie le pagó todavía al encargado. Si sale, o si ya no
 * se puede corregir (alguien pagó mientras tanto), el formulario se va al volver a armar la página y con él su mensaje:
 * cómo salió va en la página (?correccion=, ver CartelCorreccion), como el de una reserva que no sale.
 */
export async function fixGroupGiftAction(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const p = compraDesdeForm(formData)
  const r = await corregirCompra(db, str(formData, 'giftId') ?? '', await usuarioRegalador(), p)
  revalidarRegalo(formData)
  if (r.ok || r.reason === 'ya_pagaron' || r.reason === 'nada_que_corregir') {
    const token = str(formData, 'token')
    const itemId = str(formData, 'itemId')
    redirect(`${token && itemId && esUuid(itemId) ? `/l/${encodeURIComponent(token)}/item/${itemId}` : '/cuentas'}?correccion=${r.ok ? 'ok' : r.reason}`)
  }
  return { error: errorDeCompra(r, p) }
}

/** monto: la parte que mostraba la pantalla (ver marcarPagado). */
export async function markPaidAction(formData: FormData) {
  const userId = await usuarioRegalador()
  await marcarPagado(db, str(formData, 'giftId') ?? '', str(formData, 'deudorId') ?? '', userId, str(formData, 'pagado') !== '0', entero(formData, 'monto'))
  revalidarRegalo(formData)
}

/** neto: lo que decía el botón (ver saldarCon). */
export async function settleUpAction(formData: FormData) {
  await saldarCon(db, await usuarioRegalador(), str(formData, 'otroId') ?? '', entero(formData, 'neto'))
  revalidarRegalo(formData)
}

// ---------- Avisos push y codazos ----------

export async function suscribirAvisosAction(suscripcion: unknown): Promise<boolean> {
  const session = await auth()
  if (!session?.userId) return false
  return guardarSuscripcion(db, session.userId, suscripcion)
}

/** Al abrir Perfil: si los avisos de este navegador están a nombre de uno (y si faltaban, los vuelve a guardar). */
export async function confirmarAvisosAction(suscripcion: unknown): Promise<boolean> {
  const session = await auth()
  if (!session?.userId) return false
  return confirmarSuscripcion(db, session.userId, suscripcion)
}

export async function desuscribirAvisosAction(endpoint: string) {
  const session = await auth()
  if (session?.userId) await borrarSuscripcion(db, session.userId, endpoint)
}

/** Un aviso de prueba a los dispositivos de uno mismo. Devuelve a cuántos llegó, o 'espera' si probó hace menos de un minuto. */
export async function probarAvisoAction(): Promise<number | 'espera'> {
  const session = await auth()
  if (!session?.userId) return 0
  const r = await probarAviso(db, session.userId)
  return r.ok ? r.llegaron : r.reason
}

export async function codazoAction(formData: FormData) {
  const token = str(formData, 'token') ?? ''
  if (!(await listaDeToken(token))) redirect('/')
  // Sin decir quién es no hay codazo, y acá no se anota a nadie: se anota arriba ("¿Quién sos?") o entra con Google.
  const viewer = await getViewer()
  const r = await mandarCodazo(db, token, viewer, (await nombreDeViewer(db, viewer)) ?? 'Alguien')
  redirect(`/l/${token}?codazo=${r.ok ? (r.avisados ? 'avisado' : 'cartel') : r.reason}#codazo`)
}

export async function vistoCodazosAction() {
  const session = await auth()
  if (!session?.userId) return
  await marcarCodazosVistos(db, session.userId)
  revalidatePath('/', 'layout')
}

// ---------------------------------------------------------------- amigos

/**
 * Mandar una solicitud de amistad: a un usuario por su id (desde su lista o Tu gente), o por lo que escribió en Agregar
 * amigo (su @usuario o su mail). Vuelve a donde estaba con ?amigo=<cómo salió>.
 */
export async function pedirAmistadAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const volver = rutaPropia(str(formData, 'volver') ?? '/gente')
  const para = str(formData, 'para')
  const quien = str(formData, 'quien') ?? ''
  let r
  if (para) r = await pedirAmistad(db, session.userId, para)
  else if (normalizarEmail(quien)) r = await pedirAmistadPorMail(db, session.userId, quien)
  else {
    const p = await buscarPorUsuario(db, quien)
    r = p ? await pedirAmistad(db, session.userId, p.id) : { ok: false as const, reason: 'no_existe' as const }
  }
  revalidatePath('/gente')
  redirect(conParametro(volver, 'amigo', r.ok ? r.estado : r.reason))
}

export async function responderSolicitudAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const acepta = str(formData, 'acepta') === '1'
  const ok = await responderSolicitud(db, session.userId, str(formData, 'id') ?? '', acepta)
  revalidatePath('/', 'layout')
  redirect(ok && acepta ? '/gente?amigo=aceptada' : '/gente')
}

export async function cancelarSolicitudAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await cancelarSolicitud(db, session.userId, str(formData, 'id') ?? '')
  revalidatePath('/gente')
}

export async function dejarDeSerAmigosAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await dejarDeSerAmigos(db, session.userId, str(formData, 'userId') ?? '')
  revalidatePath('/gente')
  revalidatePath('/eventos')
}

/** El link de amigo de alguien: quedan amigos y va a Tu gente, donde ya está. */
export async function aceptarLinkDeAmigoAction(formData: FormData) {
  const session = await auth()
  const token = str(formData, 'token') ?? ''
  if (!session?.userId || !(await existeUsuario(db, session.userId))) redirect(`/amigo/${encodeURIComponent(token)}`)
  const r = await aceptarLinkDeAmigo(db, session.userId, token)
  revalidatePath('/', 'layout')
  redirect(r.ok ? '/gente?amigo=link' : `/amigo/${encodeURIComponent(token)}`)
}

/** Perfil: cambiar el @usuario. */
export async function cambiarUsuarioAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const r = await cambiarUsuario(db, session.userId, formData.get('usuario'))
  revalidatePath('/perfil')
  redirect(`/perfil?usuario=${r.ok ? 'ok' : r.error}#usuario`)
}
