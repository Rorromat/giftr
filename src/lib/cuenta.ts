import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, ne, notExists, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  amigoInvisibleExcluidos, amigoInvisibleGente, amigoInvisiblePreguntas, amigosInvisibles, amistades, avisos, claims, codazos, comments,
  fotosDeseo, fotosPerfil, groupGiftMembers, groupGifts, groupGiftSacados, guestIdentities, idDeFotoDeseo, invitacionesRegalo, items,
  listasDeInvitado, listFollows, listMembers, lists, notifications, pedidosAfuera, pushSubs, recordatoriosEnviados, users,
} from '@/db/schema'
import type { Db } from '@/db/types'
import { borrarAmigoInvisible, responderJuego } from '@/lib/amigo-invisible'
import { noEsDeRegaloGrupal } from '@/lib/claims'
import { avisar, type Enviar } from '@/lib/codazos'
import { duenosDeLista, esDuenoSql, esUuid, noEsNiFueDuenoSql, salirDeGrupo } from '@/lib/groups'
import { dejarAviso, textoDeAviso } from '@/lib/notifications'
import { cancelarRegalo, salirDeRegalo } from '@/lib/regalos'
import { newShareToken } from '@/lib/users'

// Tu cuenta es tuya: bajarte lo que GiftR guarda de vos (exportarMisDatos) y borrarla (borrarCuenta).
// La regla de la sorpresa vale también acá. Lo que se exporta nunca trae quién reservó o compró cosas de tus listas, ni
// nada que deje adivinarlo (conteos, fechas, el hilo de tus deseos): sale igual lo hayan reservado todo o nada. Y borrar
// la cuenta no le cuenta a nadie quién le regalaba a quién.

/** Cómo figura, donde tiene que seguir figurando, alguien que borró su cuenta (ver borrarCuenta). */
export const CUENTA_ELIMINADA = 'Cuenta eliminada'
/** Y una lista en común que se fue con su único dueño, donde otros todavía tienen cuentas de algo que compraron para ella. */
const LISTA_ELIMINADA = 'Una lista eliminada'

// ---------------------------------------------------------------- exportar

const iso = (f: Date | null) => f?.toISOString() ?? null

/**
 * Todo lo que GiftR guarda de alguien, para bajarlo (un JSON que se lee): su perfil, sus listas y deseos (también los
 * archivados y los que eliminó), su gente, lo que él reservó o compró en listas de otros, sus regalos grupales con sus
 * cuentas, sus amigos invisibles (a quién le regala; quién le regala a él, nunca) y sus avisos.
 * De sus propias listas van solo los deseos, tal como los cargó: ninguna reserva, compra, regalo grupal ni comentario de
 * los que le regalan. Lo que él hizo como regalador sobre una lista que después pasó a ser suya (se sumó a "Casa" con
 * algo ya comprado) tampoco: es la capa que la app ya no le muestra. Null si la cuenta no existe.
 */
export async function exportarMisDatos(db: Db, userId: string, ahora = new Date()) {
  if (!esUuid(userId)) return null
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.eliminadaAt)))
  if (!u) return null

  // de quién es una lista, para decirlo en cada cosa que regala: su dueño, el nombre de la lista en común, o para quién
  // es la sorpresa
  const dueno = alias(users, 'dueno')
  const paraQuien = alias(users, 'para_quien')
  const para = sql<string>`coalesce(${dueno.nombre}, ${paraQuien.nombre}, ${lists.nombre}, '')`
  const ajena = noEsNiFueDuenoSql(db, userId)
  const otro = alias(users, 'otro')

  // ---- sus listas: la personal y las listas en común que arma hoy. Solo los deseos.
  const mias = await db.select().from(lists)
    .where(and(inArray(lists.tipo, ['personal', 'grupo']), esDuenoSql(db, userId))).orderBy(asc(lists.createdAt))
  const deseos = mias.length
    ? await db.select().from(items).where(inArray(items.listId, mias.map((l) => l.id))).orderBy(asc(items.createdAt))
    : []
  const deLista = (listId: string) => deseos.filter((d) => d.listId === listId).map((d) => ({
    titulo: d.titulo, tipo: d.tipo, notas: d.notas, foto: d.fotoUrl, precio: d.precio, rangoPrecio: d.rangoPrecio, categoria: d.categoria,
    prioridad: d.prioridad, cantidad: d.cantidad, sePuedeRepetir: d.repetible, linkTienda: d.linkTienda, video: d.videoUrl,
    // de un aporte en plata: a qué alias le transfieren y la meta. De quién aportó o cuánto, nada, como del resto
    ...(d.tipo === 'aporte' && { aliasParaAportar: d.aporteAlias, metaDelAporte: d.aporteMeta }),
    // eliminado: lo sacó con "Eliminar" (para los que regalan quedó como "Ya no lo quiero", ver borrarDeseo)
    estado: d.borradoAt ? 'eliminado' as const : d.estadoDueno, cargado: iso(d.createdAt),
  }))
  const personal = mias.find((l) => l.tipo === 'personal')
  const enComun = await Promise.all(mias.filter((l) => l.tipo === 'grupo').map(async (l) => {
    const duenos = await duenosDeLista(db, l)
    return {
      nombre: l.nombre, descripcion: l.descripcion, fecha: l.eventoFecha, seRepiteCadaAnio: l.eventoAnual, esUnCumple: l.esCumple, foto: l.fotoUrl,
      link: `/l/${l.shareToken}`, soloConCuentaSeVeQuienReservo: l.nombresSoloConCuenta,
      laArman: duenos.map((d) => d.nombre), paraVosEs: duenos.find((d) => d.id === userId)?.parentesco ?? null,
      deseos: deLista(l.id),
    }
  }))
  const dejadas = await db.select({ nombre: lists.nombre, saliste: listMembers.salioAt }).from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId)).where(and(eq(listMembers.userId, userId), isNotNull(listMembers.salioAt)))

  // ---- su gente
  const filasAmigos = await db.select({ de: amistades.deUserId, nombre: otro.nombre, usuario: otro.usuario, desde: amistades.respondidaAt })
    .from(amistades)
    .innerJoin(otro, sql`${otro.id} = case when ${amistades.deUserId} = ${userId} then ${amistades.paraUserId} else ${amistades.deUserId} end`)
    .where(and(eq(amistades.estado, 'aceptada'), or(eq(amistades.deUserId, userId), eq(amistades.paraUserId, userId))))
    .orderBy(asc(otro.nombre))
  // las que mandó y no son amistad: para él todas esperan (una rechazada no se le dice, ver amigos.ts), así que acá tampoco
  const enviadas = await db.select({ mail: amistades.paraEmail, nombre: otro.nombre, usuario: otro.usuario, enviada: amistades.createdAt })
    .from(amistades).leftJoin(otro, eq(otro.id, amistades.paraUserId))
    .where(and(eq(amistades.deUserId, userId), ne(amistades.estado, 'aceptada'), isNull(amistades.ocultaAt)))
    .orderBy(desc(amistades.createdAt))
  const recibidas = await db.select({ nombre: otro.nombre, recibida: amistades.createdAt }).from(amistades)
    .innerJoin(otro, eq(otro.id, amistades.deUserId))
    .where(and(eq(amistades.paraUserId, userId), eq(amistades.estado, 'pendiente'))).orderBy(desc(amistades.createdAt))
  const seguidas = await db.select({ de: para, tipo: lists.tipo, desde: listFollows.createdAt }).from(listFollows)
    .innerJoin(lists, eq(lists.id, listFollows.listId))
    .leftJoin(dueno, eq(dueno.id, lists.ownerId)).leftJoin(paraQuien, eq(paraQuien.id, lists.paraUserId))
    .where(and(eq(listFollows.userId, userId), inArray(lists.tipo, ['personal', 'grupo']), ajena)).orderBy(asc(listFollows.createdAt))
  const codazosMandados = await db.select({ a: otro.nombre, cuando: codazos.createdAt }).from(codazos)
    .innerJoin(otro, eq(otro.id, codazos.paraUserId)).where(eq(codazos.deUserId, userId)).orderBy(desc(codazos.createdAt))

  // ---- lo que regala: sus reservas y compras sueltas en listas de otros
  const sueltas = await db.select({
    deseo: items.titulo, para, estado: claims.estado, desde: claims.createdAt, cambio: claims.updatedAt, vence: claims.expiresAt, nota: claims.notaQueCompre,
    tipoDeseo: items.tipo, aporteMonto: claims.aporteMonto,
  }).from(claims).innerJoin(items, eq(items.id, claims.itemId)).innerJoin(lists, eq(lists.id, items.listId))
    .leftJoin(dueno, eq(dueno.id, lists.ownerId)).leftJoin(paraQuien, eq(paraQuien.id, lists.paraUserId))
    .where(and(eq(claims.claimerUserId, userId), noEsDeRegaloGrupal(), ajena)).orderBy(desc(claims.createdAt))

  // ---- sus regalos grupales y sus cuentas: lo que le toca a él y, de los que organiza, lo que le debe cada uno
  const regalos = await db.select({
    id: groupGifts.id, deseo: items.titulo, para, estado: groupGifts.estado, organizador: groupGifts.organizerUserId, organiza: otro.nombre,
    total: groupGifts.montoTotal, moneda: groupGifts.moneda, comprado: groupGifts.compradoAt, armado: groupGifts.createdAt,
    parte: groupGiftMembers.monto, puso: groupGiftMembers.pagadoMonto, saldado: groupGiftMembers.pagado, sumado: groupGiftMembers.createdAt,
  }).from(groupGiftMembers).innerJoin(groupGifts, eq(groupGifts.id, groupGiftMembers.giftId))
    .innerJoin(items, eq(items.id, groupGifts.itemId)).innerJoin(lists, eq(lists.id, items.listId))
    .innerJoin(otro, eq(otro.id, groupGifts.organizerUserId))
    .leftJoin(dueno, eq(dueno.id, lists.ownerId)).leftJoin(paraQuien, eq(paraQuien.id, lists.paraUserId))
    .where(and(eq(groupGiftMembers.userId, userId), ajena)).orderBy(desc(groupGifts.createdAt))
  const queOrganiza = regalos.filter((r) => r.organizador === userId && r.estado === 'comprado').map((r) => r.id)
  const deudores = queOrganiza.length
    ? await db.select({ giftId: groupGiftMembers.giftId, nombre: users.nombre, parte: groupGiftMembers.monto, puso: groupGiftMembers.pagadoMonto, saldado: groupGiftMembers.pagado })
      .from(groupGiftMembers).innerJoin(users, eq(users.id, groupGiftMembers.userId))
      .where(and(inArray(groupGiftMembers.giftId, queOrganiza), ne(groupGiftMembers.userId, userId))).orderBy(asc(groupGiftMembers.createdAt))
    : []
  const invitaciones = await db.select({
    de: invitacionesRegalo.deUserId, quien: otro.nombre, deseo: items.titulo, estado: invitacionesRegalo.estado, cuando: invitacionesRegalo.createdAt,
  }).from(invitacionesRegalo).innerJoin(groupGifts, eq(groupGifts.id, invitacionesRegalo.giftId))
    .innerJoin(items, eq(items.id, groupGifts.itemId)).innerJoin(lists, eq(lists.id, items.listId))
    .innerJoin(otro, sql`${otro.id} = case when ${invitacionesRegalo.deUserId} = ${userId} then ${invitacionesRegalo.paraUserId} else ${invitacionesRegalo.deUserId} end`)
    .where(and(or(eq(invitacionesRegalo.deUserId, userId), eq(invitacionesRegalo.paraUserId, userId)), ajena))
    .orderBy(desc(invitacionesRegalo.createdAt))
  const comentarios = await db.select({ deseo: items.titulo, para, texto: comments.texto, cuando: comments.createdAt }).from(comments)
    .innerJoin(items, eq(items.id, comments.itemId)).innerJoin(lists, eq(lists.id, items.listId))
    .leftJoin(dueno, eq(dueno.id, lists.ownerId)).leftJoin(paraQuien, eq(paraQuien.id, lists.paraUserId))
    .where(and(eq(comments.authorUserId, userId), ajena)).orderBy(desc(comments.createdAt))

  // ---- amigo invisible: a quién le regala él, sí; quién le regala a él, nunca (ni aunque ya lo haya pedido ver)
  const juegos = await db.select({ juego: amigosInvisibles, mia: amigoInvisibleGente, leRegalaA: otro.nombre }).from(amigoInvisibleGente)
    .innerJoin(amigosInvisibles, eq(amigosInvisibles.id, amigoInvisibleGente.amigoInvisibleId))
    .leftJoin(otro, eq(otro.id, amigoInvisibleGente.regalaA))
    .where(and(eq(amigoInvisibleGente.userId, userId), ne(amigoInvisibleGente.estado, 'sacado'))).orderBy(desc(amigosInvisibles.fecha))
  const juegoIds = juegos.map((j) => j.juego.id)
  const preguntas = juegoIds.length
    ? await db.select().from(amigoInvisiblePreguntas)
      .where(and(inArray(amigoInvisiblePreguntas.amigoInvisibleId, juegoIds), or(eq(amigoInvisiblePreguntas.deUserId, userId), eq(amigoInvisiblePreguntas.paraUserId, userId))))
      .orderBy(asc(amigoInvisiblePreguntas.createdAt))
    : []
  const queOrganizaJuegos = juegos.filter((j) => j.juego.organizadorId === userId).map((j) => j.juego.id)
  const jugadores = queOrganizaJuegos.length
    ? await db.select({ juegoId: amigoInvisibleGente.amigoInvisibleId, nombre: users.nombre, estado: amigoInvisibleGente.estado })
      .from(amigoInvisibleGente).innerJoin(users, eq(users.id, amigoInvisibleGente.userId))
      .where(and(inArray(amigoInvisibleGente.amigoInvisibleId, queOrganizaJuegos), ne(amigoInvisibleGente.userId, userId))).orderBy(asc(amigoInvisibleGente.createdAt))
    : []

  // ---- sus avisos: la bandeja y los de los deseos que regala (los de un deseo propio no existen para él, ver avisosDeDeseos)
  const bandeja = await db.select({ titulo: avisos.titulo, cuerpo: avisos.cuerpo, que: avisos.tipo, cuando: avisos.createdAt }).from(avisos)
    .where(eq(avisos.userId, userId)).orderBy(desc(avisos.createdAt))
  const deDeseos = await db.select({ tipo: notifications.tipo, deseo: items.titulo, tipoLista: lists.tipo, leido: notifications.leida, cuando: notifications.createdAt })
    .from(notifications).innerJoin(items, eq(items.id, notifications.itemId)).innerJoin(lists, eq(lists.id, items.listId))
    .where(and(eq(notifications.userId, userId), ajena)).orderBy(desc(notifications.createdAt))
  const dispositivos = await db.select({ endpoint: pushSubs.endpoint, desde: pushSubs.createdAt }).from(pushSubs).where(eq(pushSubs.userId, userId))
  const [{ fotos }] = await db.select({ fotos: sql<number>`count(*)::int` }).from(fotosDeseo).where(eq(fotosDeseo.userId, userId))

  return {
    sobreEsteArchivo: {
      que: 'Lo que GiftR guarda de tu cuenta.',
      generado: ahora.toISOString(),
      loQueNoTrae: 'Quién reservó o compró cosas de tus listas: es la sorpresa, y acá tampoco se cuenta.',
    },
    perfil: {
      nombre: u.nombre, mail: u.email, usuario: u.usuario, fotoDeGoogle: u.avatarUrl, subisteUnaFoto: !!u.fotoAt,
      cumple: u.cumpleDia && u.cumpleMes ? { dia: u.cumpleDia, mes: u.cumpleMes } : null,
      gustos: u.gustos, aliasParaTransferirte: u.aliasPago, linkDeAmigo: u.amigoToken ? `/amigo/${u.amigoToken}` : null,
    },
    tuLista: personal
      ? { link: `/l/${personal.shareToken}`, soloConCuentaSeVeQuienReservo: personal.nombresSoloConCuenta, deseos: deLista(personal.id) }
      : null,
    listasEnComun: enComun,
    listasEnComunQueDejaste: dejadas.map((d) => ({ nombre: d.nombre, saliste: iso(d.saliste) })),
    tuGente: {
      amigos: filasAmigos.map((a) => ({ nombre: a.nombre, usuario: a.usuario, desde: iso(a.desde) })),
      solicitudesQueMandaste: enviadas.map((s) => ({ a: s.mail ?? (s.usuario ? `@${s.usuario}` : s.nombre ?? ''), enviada: iso(s.enviada) })),
      solicitudesQueTeEsperan: recibidas.map((s) => ({ de: s.nombre, recibida: iso(s.recibida) })),
      listasQueSeguis: seguidas.map((s) => ({ de: s.de, esListaEnComun: s.tipo === 'grupo', desde: iso(s.desde) })),
      codazosQueMandaste: codazosMandados.map((c) => ({ a: c.a, cuando: iso(c.cuando) })),
    },
    loQueRegalas: {
      reservasYCompras: sueltas.map((c) => ({
        deseo: c.deseo, para: c.para, estado: c.estado, desde: iso(c.desde), ultimoCambio: iso(c.cambio), vence: c.estado === 'reservado' ? iso(c.vence) : null,
        nota: c.nota,
        // un aporte en plata: lo anotó con "Ya aporté", con cuánto si lo dijo
        ...(c.tipoDeseo === 'aporte' && { esUnAporteEnPlata: true, cuantoAportaste: c.aporteMonto }),
      })),
      regalosGrupales: regalos.map((r) => ({
        deseo: r.deseo, para: r.para, estado: r.estado, loOrganizas: r.organizador === userId, loOrganiza: r.organiza,
        total: r.total, moneda: r.moneda, tuParte: r.parte, yaPusiste: r.puso, saldado: r.saldado, teSumaste: iso(r.sumado), comprado: iso(r.comprado),
        ...(r.organizador === userId && r.estado === 'comprado' && {
          teDeben: deudores.filter((d) => d.giftId === r.id).map((d) => ({ quien: d.nombre, parte: d.parte, yaPuso: d.puso, saldado: d.saldado })),
        }),
      })),
      invitacionesARegalosGrupales: invitaciones.map((i) => ({
        ...(i.de === userId ? { a: i.quien } : { de: i.quien }), deseo: i.deseo, estado: i.estado, cuando: iso(i.cuando),
      })),
      comentarios: comentarios.map((c) => ({ deseo: c.deseo, para: c.para, texto: c.texto, cuando: iso(c.cuando) })),
    },
    amigosInvisibles: juegos.map(({ juego: j, mia, leRegalaA }) => ({
      nombre: j.nombre, tematica: j.descripcion, regla: j.regla, presupuesto: j.presupuesto, fecha: j.fecha, loOrganizas: j.organizadorId === userId,
      jugas: mia.estado === 'juega' ? 'si' as const : mia.estado === 'invitado' ? 'no contestaste' as const : 'no' as const,
      sorteado: !!j.sorteadoAt, leRegalasA: leRegalaA, yaTenesElRegalo: !!mia.yaLoTengoAt,
      preguntasQueHiciste: preguntas.filter((p) => p.amigoInvisibleId === j.id && p.deUserId === userId).map((p) => ({ pregunta: p.texto, respuesta: p.respuesta })),
      // las que le hizo quien le regala: sin decir quién (él tampoco lo ve)
      preguntasQueTeHicieron: preguntas.filter((p) => p.amigoInvisibleId === j.id && p.paraUserId === userId).map((p) => ({ pregunta: p.texto, respuesta: p.respuesta })),
      ...(j.organizadorId === userId && {
        losDemas: jugadores.filter((g) => g.juegoId === j.id).map((g) => ({ nombre: g.nombre, estado: g.estado })),
      }),
    })),
    avisos: {
      bandeja: bandeja.map((a) => ({ titulo: a.titulo, detalle: a.cuerpo, que: a.que, cuando: iso(a.cuando) })),
      deLosDeseosQueRegalas: deDeseos.flatMap((n) => {
        const texto = textoDeAviso(n.tipo, n.deseo, n.tipoLista === 'sorpresa')
        return texto ? [{ texto, leido: n.leido, cuando: iso(n.cuando) }] : []
      }),
      // de cada dispositivo donde activó los avisos, solo de qué servicio es (la dirección entera es una clave)
      dispositivosConAvisos: dispositivos.map((d) => ({ servicio: hostDe(d.endpoint), desde: iso(d.desde) })),
    },
    fotosDeDeseosQueSubiste: fotos,
  }
}

export type MisDatos = NonNullable<Awaited<ReturnType<typeof exportarMisDatos>>>

function hostDe(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- borrar

/** Lo que cambia para otros si borra la cuenta, para decírselo antes (solo lo suyo: nada de quién le regala). */
export type AlBorrar = {
  /** regalos grupales que organiza y todavía no compró: se cancelan */
  regalosAbiertos: number
  /** está en algún regalo grupal ya comprado: esas cuentas quedan a nombre de "Cuenta eliminada" */
  enCuentas: boolean
  /** amigos invisibles que organiza y no sorteó: se cancelan */
  juegosSinSortear: string[]
  /** amigos invisibles ya sorteados: los que organiza (quedan como están) y los demás en los que juega (se baja) */
  juegosSorteadosQueOrganiza: string[]
  juegaEnOtros: boolean
  /** listas en común que arma solo (se borran) y con otros (sale) */
  listasSolo: string[]
  listasConOtros: string[]
}

export async function loQueCambiaAlBorrar(db: Db, userId: string): Promise<AlBorrar> {
  const [regalos, juegos, grupos] = await Promise.all([
    db.select({ estado: groupGifts.estado, organizador: groupGifts.organizerUserId }).from(groupGiftMembers)
      .innerJoin(groupGifts, eq(groupGifts.id, groupGiftMembers.giftId))
      .where(and(eq(groupGiftMembers.userId, userId), inArray(groupGifts.estado, ['abierto', 'comprado']))),
    db.select({ nombre: amigosInvisibles.nombre, organizador: amigosInvisibles.organizadorId, sorteado: amigosInvisibles.sorteadoAt, estado: amigoInvisibleGente.estado })
      .from(amigoInvisibleGente).innerJoin(amigosInvisibles, eq(amigosInvisibles.id, amigoInvisibleGente.amigoInvisibleId))
      .where(eq(amigoInvisibleGente.userId, userId)),
    db.select({ nombre: lists.nombre, otros: sql<number>`(select count(*)::int from ${listMembers} m where m.list_id = ${lists.id} and m.user_id <> ${userId} and m.salio_at is null)` })
      .from(listMembers).innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(and(eq(listMembers.userId, userId), isNull(listMembers.salioAt), eq(lists.tipo, 'grupo'))),
  ])
  return {
    regalosAbiertos: regalos.filter((r) => r.estado === 'abierto' && r.organizador === userId).length,
    enCuentas: regalos.some((r) => r.estado === 'comprado'),
    juegosSinSortear: juegos.filter((j) => j.organizador === userId && !j.sorteado).map((j) => j.nombre),
    juegosSorteadosQueOrganiza: juegos.filter((j) => j.organizador === userId && j.sorteado).map((j) => j.nombre),
    juegaEnOtros: juegos.some((j) => j.organizador !== userId && j.estado === 'juega'),
    listasSolo: grupos.filter((g) => !g.otros).map((g) => g.nombre ?? 'Lista en común'),
    listasConOtros: grupos.filter((g) => g.otros).map((g) => g.nombre ?? 'Lista en común'),
  }
}

/**
 * Antes de borrar, lo que hay que decirles a otros, con las funciones de siempre (cada una con sus avisos): cancela los
 * regalos grupales que organizaba sin comprar, se baja de los que estaba, se baja de los amigos invisibles (con el sorteo
 * hecho, el hueco se arregla como cuando se baja cualquiera), cancela los que organizaba sin sortear y sale de las listas
 * en común que arma con otros. Va antes y aparte del borrado: mandar un aviso al celular es salir a la red, y eso no se
 * hace con una transacción abierta. Si algo de esto falla no frena nada: el borrado resuelve igual lo que quede.
 */
async function despedirse(db: Db, userId: string, enviar?: Enviar) {
  const intentar = async (paso: () => Promise<unknown>) => {
    try {
      await paso()
    } catch (e) {
      console.error('Al borrar una cuenta, un paso previo falló (el borrado sigue):', e)
    }
  }
  const regalos = await db.select({ id: groupGifts.id, organizador: groupGifts.organizerUserId }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGifts.id, groupGiftMembers.giftId))
    .where(and(eq(groupGiftMembers.userId, userId), eq(groupGifts.estado, 'abierto')))
  for (const r of regalos) await intentar(() => (r.organizador === userId ? cancelarRegalo(db, r.id, userId) : salirDeRegalo(db, r.id, userId)))

  const juegos = await db.select({ id: amigosInvisibles.id, nombre: amigosInvisibles.nombre, organizador: amigosInvisibles.organizadorId, sorteado: amigosInvisibles.sorteadoAt, estado: amigoInvisibleGente.estado })
    .from(amigoInvisibleGente).innerJoin(amigosInvisibles, eq(amigosInvisibles.id, amigoInvisibleGente.amigoInvisibleId))
    .where(eq(amigoInvisibleGente.userId, userId))
  for (const j of juegos) {
    if (j.organizador !== userId) {
      if (j.estado === 'juega' || j.estado === 'invitado') await intentar(() => responderJuego(db, j.id, userId, false, enviar))
    } else if (!j.sorteado) {
      await intentar(async () => {
        const estaban = await db.select({ userId: amigoInvisibleGente.userId }).from(amigoInvisibleGente)
          .where(and(eq(amigoInvisibleGente.amigoInvisibleId, j.id), ne(amigoInvisibleGente.userId, userId), inArray(amigoInvisibleGente.estado, ['juega', 'invitado'])))
        if (!(await borrarAmigoInvisible(db, j.id, userId))) return
        // sin "de" ni su nombre: el aviso queda en la bandeja de los demás, y de la cuenta borrada no queda nada
        await Promise.all(estaban.map((g) => avisar(db, g.userId, {
          tipo: null, title: `🎅 Se canceló el amigo invisible "${j.nombre}"`,
          body: 'Quien lo organizaba borró su cuenta de GiftR. Si lo quieren hacer igual, lo puede armar otro.', url: '/invisible',
        }, enviar).catch(() => 0)))
      })
    }
  }

  const grupos = await db.select({ id: listMembers.listId }).from(listMembers)
    .where(and(eq(listMembers.userId, userId), isNull(listMembers.salioAt)))
  // el último dueño no sale (ver salirDeGrupo): esa lista se borra con la cuenta
  for (const g of grupos) await intentar(() => salirDeGrupo(db, g.id, userId))
}

/** Las listas que se van con la cuenta: la personal y las listas en común donde no queda nadie más armándola. */
function susListas(db: Db, userId: string) {
  const conOtros = db.select({ id: listMembers.listId }).from(listMembers).where(and(ne(listMembers.userId, userId), isNull(listMembers.salioAt)))
  return db.select({ id: lists.id, tipo: lists.tipo, nombre: lists.nombre }).from(lists).where(or(
    eq(lists.ownerId, userId),
    and(eq(lists.tipo, 'grupo'), inArray(lists.id, db.select({ id: listMembers.listId }).from(listMembers).where(eq(listMembers.userId, userId))), notInArray(lists.id, conOtros)),
  ))
}

/**
 * Los que tenían algo reservado o comprado en las listas que se van (o estaban en un regalo grupal sin comprar): a ellos
 * hay que decirles que la lista ya no está. Solo con cuenta: un invitado no tiene bandeja.
 */
async function losQueLeRegalaban(db: Db, userId: string): Promise<string[]> {
  const ids = (await susListas(db, userId)).map((l) => l.id)
  if (!ids.length) return []
  const deseosActivos = db.select({ id: items.id }).from(items).where(and(inArray(items.listId, ids), eq(items.estadoDueno, 'activo')))
  const [conReserva, enRegalos] = await Promise.all([
    db.selectDistinct({ userId: claims.claimerUserId }).from(claims)
      .where(and(inArray(claims.itemId, deseosActivos), inArray(claims.estado, ['reservado', 'comprado']), isNotNull(claims.claimerUserId))),
    db.selectDistinct({ userId: groupGiftMembers.userId }).from(groupGiftMembers).innerJoin(groupGifts, eq(groupGifts.id, groupGiftMembers.giftId))
      .where(and(inArray(groupGifts.itemId, deseosActivos), eq(groupGifts.estado, 'abierto'))),
  ])
  return [...new Set([...conReserva, ...enRegalos].map((r) => r.userId!))].filter((id) => id !== userId)
}

/**
 * Borra las listas enteras: sus deseos, lo reservado, los comentarios, los avisos y los regalos grupales sin comprar.
 * conservarCuentas: un regalo grupal ya comprado tiene cuentas entre los que lo compraron (Bruno le debe su parte a Ana), y
 * eso es de ellos: de ese deseo queda solo el nombre (para que sepan qué están saldando), fuera de toda lista que se pueda
 * abrir, y la lista queda como un cascarón sin dueño visible. Devuelve las listas que quedaron así.
 */
async function borrarListas(t: Db, listIds: string[], conservarCuentas: boolean): Promise<Set<string>> {
  const cascarones = new Set<string>()
  if (!listIds.length) return cascarones
  // lock de los deseos, en el orden de siempre (ver unirseAGrupo): una reserva que llega a la vez espera, y ya no lo encuentra
  const deseos = await t.select({ id: items.id, listId: items.listId }).from(items).where(inArray(items.listId, listIds)).orderBy(asc(items.id)).for('update')
  const ids = deseos.map((d) => d.id)
  if (ids.length) {
    const comprados = conservarCuentas
      ? await t.select({ itemId: groupGifts.itemId }).from(groupGifts).where(and(inArray(groupGifts.itemId, ids), eq(groupGifts.estado, 'comprado')))
      : []
    const quedan = [...new Set(comprados.map((c) => c.itemId))]
    const seVan = ids.filter((id) => !quedan.includes(id))
    for (const d of deseos) if (quedan.includes(d.id)) cascarones.add(d.listId)

    // con conservarCuentas quedan solo los regalos ya comprados; sin eso, ninguno
    const seVa = and(inArray(groupGifts.itemId, ids), conservarCuentas ? ne(groupGifts.estado, 'comprado') : undefined)
    const regalosQueSeVan = t.select({ id: groupGifts.id }).from(groupGifts).where(seVa)
    await t.delete(invitacionesRegalo).where(inArray(invitacionesRegalo.giftId, regalosQueSeVan))
    await t.delete(groupGiftSacados).where(inArray(groupGiftSacados.giftId, regalosQueSeVan))
    await t.delete(groupGiftMembers).where(inArray(groupGiftMembers.giftId, regalosQueSeVan))
    await t.delete(groupGifts).where(seVa)
    // de un deseo que queda, solo lo comprado (lo que sostiene las cuentas); de los demás, todo
    await t.delete(claims).where(and(inArray(claims.itemId, ids), quedan.length ? or(ne(claims.estado, 'comprado'), notInArray(claims.itemId, quedan)) : undefined))
    if (seVan.length) {
      await t.delete(comments).where(inArray(comments.itemId, seVan))
      await t.delete(notifications).where(inArray(notifications.itemId, seVan))
      await t.delete(items).where(inArray(items.id, seVan))
    }
    if (quedan.length) {
      await t.update(items).set({
        notas: null, fotoUrl: null, precio: null, rangoPrecio: null, categoria: null, linkTienda: null, videoUrl: null, aporteAlias: null, aporteMeta: null,
        estadoDueno: 'no_lo_quiero', borradoAt: sql`coalesce(${items.borradoAt}, now())`,
      }).where(inArray(items.id, quedan))
    }
  }
  await t.delete(listFollows).where(inArray(listFollows.listId, listIds))
  await t.delete(listasDeInvitado).where(inArray(listasDeInvitado.listId, listIds))
  await t.delete(codazos).where(inArray(codazos.listId, listIds))
  await t.delete(listMembers).where(inArray(listMembers.listId, listIds))
  // en qué lista se anotó un invitado solo cuenta para el tope del día (ver anotarInvitado): sin la lista, no cuenta
  await t.update(guestIdentities).set({ anotadoEn: null }).where(inArray(guestIdentities.anotadoEn, listIds))
  // una sorpresa que alguien armó para esta lista en común sigue siendo de los que la armaron: queda sin la lista
  await t.update(lists).set({ paraListId: null, nombre: LISTA_ELIMINADA }).where(inArray(lists.paraListId, listIds))
  const enteras = listIds.filter((id) => !cascarones.has(id))
  if (enteras.length) await t.delete(lists).where(inArray(lists.id, enteras))
  if (cascarones.size) {
    // con un link nuevo que no tiene nadie: no se abre más
    for (const id of cascarones) {
      await t.update(lists).set({
        shareToken: newShareToken(), shareTokenAt: sql`now()`, inviteToken: null, nombre: sql`case when ${lists.tipo} = 'personal' then null else ${LISTA_ELIMINADA} end`,
        descripcion: null, fotoUrl: null, eventoFecha: null, corteEvento: null, esCumple: false,
      }).where(eq(lists.id, id))
    }
  }
  return cascarones
}

/** Los avisos de regalos grupales y de cuentas: los que nombran a otra persona ("tu parte del regalo para Euge"). */
const AVISOS_DE_REGALOS = ['regalo_comprado', 'pago', 'propuesta_regalo', 'respuesta_propuesta'] as const

const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Los avisos que ya les llegaron a otros y lo nombran: "Tu parte del regalo para Zacarías Quintero", "Ana le pagó $ 3.000
 * a Zacarías por vos". Son de quien los recibió y se quedan (se van solos a los 60 días), pero sin su nombre: donde decía
 * su nombre (entero o de pila, como palabra suelta) dice "Cuenta eliminada". Lo mismo con el nombre de una lista en común
 * que se va con él ("el regalo para Juancito"). Solo en los avisos de regalos y cuentas de quienes compartían un regalo
 * grupal con él o le regalaban uno: si no, se le cambiaría el nombre a otro Zacarías en los avisos de gente que nunca tuvo
 * nada que ver. Con el nombre de ahora: si lo cambió hace poco, uno viejo puede decir el de antes.
 */
async function sacarNombresDeAvisos(t: Db, userId: string, nombre: string) {
  const regalosDeListas = (deEstas: SQL | undefined) => t.select({ id: groupGifts.id }).from(groupGifts)
    .innerJoin(items, eq(items.id, groupGifts.itemId)).innerJoin(lists, eq(lists.id, items.listId)).where(deEstas)
  const susRegalos = t.select({ id: groupGiftMembers.giftId }).from(groupGiftMembers).where(eq(groupGiftMembers.userId, userId))
  /** Los que están en esos regalos, o fueron invitados. */
  const genteDe = async (regalos: ReturnType<typeof regalosDeListas> | typeof susRegalos) => {
    const [miembros, invitados] = await Promise.all([
      t.selectDistinct({ id: groupGiftMembers.userId }).from(groupGiftMembers).where(inArray(groupGiftMembers.giftId, regalos)),
      t.selectDistinct({ id: invitacionesRegalo.paraUserId }).from(invitacionesRegalo).where(inArray(invitacionesRegalo.giftId, regalos)),
    ])
    return [...new Set([...miembros, ...invitados].map((g) => g.id))].filter((id) => id !== userId)
  }
  const sacar = async (gente: string[], textos: string[], queda: string) => {
    if (!gente.length) return
    for (const texto of textos) {
      const patron = `(^|[^[:alnum:]])${literal(texto)}(?![[:alnum:]])`
      const sin = (columna: typeof avisos.titulo | typeof avisos.cuerpo) => sql<string>`regexp_replace(${columna}, ${patron}, ${`\\1${queda}`}, 'g')`
      await t.update(avisos).set({ titulo: sin(avisos.titulo), cuerpo: sin(avisos.cuerpo) })
        .where(and(inArray(avisos.userId, gente), inArray(avisos.tipo, [...AVISOS_DE_REGALOS])))
    }
  }

  // los regalos en los que está él, y los que le armaron a él (en su lista, o una sorpresa)
  const gente = new Set([...await genteDe(susRegalos), ...await genteDe(regalosDeListas(or(eq(lists.ownerId, userId), eq(lists.paraUserId, userId))))])
  // el entero primero: si no, de "Zacarías Quintero" quedaría "Cuenta eliminada Quintero"
  await sacar([...gente], [...new Set([nombre.trim(), nombre.trim().split(' ')[0]])].filter(Boolean), CUENTA_ELIMINADA)
  // y los de cada lista en común que se va con él, que llevan el nombre de la lista
  for (const l of await susListas(t, userId)) {
    if (l.tipo === 'grupo' && l.nombre?.trim()) await sacar(await genteDe(regalosDeListas(eq(lists.id, l.id))), [l.nombre.trim()], LISTA_ELIMINADA)
  }
}

/**
 * Borrar la cuenta. Primero se despide (ver despedirse) y después, en una sola transacción, se va todo lo suyo: sus
 * listas y deseos, fotos, gustos, cumple, alias, dispositivos con avisos, amistades, solicitudes, avisos, comentarios,
 * codazos, y la fila de la cuenta, con su id. Lo que reservó sin comprar en listas de otros se libera. De los avisos que
 * ya les llegaron a otros, los que mandó él se borran y los que lo nombran quedan sin su nombre (ver sacarNombresDeAvisos).
 *
 * Lo que compartía con otros y no se puede borrar sin romperles algo pasa a una fila nueva, "Cuenta eliminada" (sin mail,
 * sin foto, con un google_id que Google no da: nadie entra ahí, y si la persona vuelve a entrar con Google es una cuenta
 * nueva): lo que ya compró en listas de otros (sigue comprado, para que nadie lo duplique), los regalos grupales ya
 * comprados (las partes y los pagos anotados), un amigo invisible ya sorteado y las sorpresas que le armaron. Si no
 * compartía nada, no queda ninguna fila. Va a una fila nueva y no a la suya anonimizada para que su id no quede en ningún
 * lado: una sesión abierta en otro teléfono queda como la de un usuario que no existe (ver getViewer), sin poder hacer nada
 * a nombre de "Cuenta eliminada".
 *
 * Si queda una referencia a la cuenta que esto no conoce (una tabla nueva), el DELETE final falla y no se borra nada.
 */
export async function borrarCuenta(db: Db, userId: string, enviar?: Enviar): Promise<boolean> {
  if (!esUuid(userId)) return false
  const [existe] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), isNull(users.eliminadaAt)))
  if (!existe) return false
  await despedirse(db, userId, enviar)
  const regalaban = await losQueLeRegalaban(db, userId)

  const borrada = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [u] = await t.select({ id: users.id, nombre: users.nombre }).from(users).where(and(eq(users.id, userId), isNull(users.eliminadaAt))).for('update')
    if (!u) return false
    await sacarNombresDeAvisos(t, userId, u.nombre)

    let idEliminada: string | null = null
    /** La fila "Cuenta eliminada" de esta cuenta: se crea recién cuando algo la necesita. */
    const eliminada = async () => {
      if (!idEliminada) {
        const [f] = await t.insert(users).values({
          googleId: `eliminada:${randomUUID()}`, nombre: CUENTA_ELIMINADA, email: '', eliminadaAt: new Date(), bienvenidaAt: new Date(),
          avisosPreguntadosAt: new Date(),
        }).returning({ id: users.id })
        idEliminada = f.id
      }
      return idEliminada
    }

    // ---- sus listas: la personal y las listas en común donde no queda nadie más armándola
    const suyas = await susListas(t, userId)
    const cascarones = await borrarListas(t, suyas.map((l) => l.id), true)
    for (const l of suyas) if (l.tipo === 'personal' && cascarones.has(l.id)) await t.update(lists).set({ ownerId: await eliminada() }).where(eq(lists.id, l.id))
    // de las listas en común que siguen con otros, sale del todo: no queda ni como alguien que la armó
    await t.delete(listMembers).where(eq(listMembers.userId, userId))

    // ---- las sorpresas que armó y en las que no hay nadie más: son solo suyas, se van enteras
    const sorpresas = await t.select({ id: lists.id }).from(lists).where(and(
      eq(lists.tipo, 'sorpresa'), eq(lists.creadaPor, userId),
      notExists(t.select({ uno: sql`1` }).from(items).where(and(eq(items.listId, lists.id), or(
        exists(t.select({ uno: sql`1` }).from(claims).where(and(eq(claims.itemId, items.id), or(ne(claims.claimerUserId, userId), isNotNull(claims.claimerGuestId))))),
        exists(t.select({ uno: sql`1` }).from(comments).where(and(eq(comments.itemId, items.id), or(ne(comments.authorUserId, userId), isNotNull(comments.authorGuestId))))),
        exists(t.select({ uno: sql`1` }).from(notifications).where(and(eq(notifications.itemId, items.id), or(ne(notifications.userId, userId), isNotNull(notifications.guestId))))),
        exists(t.select({ uno: sql`1` }).from(groupGiftMembers).innerJoin(groupGifts, eq(groupGifts.id, groupGiftMembers.giftId))
          .where(and(eq(groupGifts.itemId, items.id), ne(groupGiftMembers.userId, userId)))),
      )))),
    ))
    await borrarListas(t, sorpresas.map((s) => s.id), false)

    // ---- regalos grupales en listas de otros
    // Uno que organizaba y quedó abierto (despedirse no llegó a cancelarlo): se cancela acá, con el mismo aviso.
    const abiertos = await t.select({ id: groupGifts.id, itemId: groupGifts.itemId, claimId: groupGifts.claimId }).from(groupGifts)
      .where(and(eq(groupGifts.organizerUserId, userId), eq(groupGifts.estado, 'abierto')))
    for (const g of abiertos) {
      await t.update(groupGifts).set({ estado: 'cancelado' }).where(eq(groupGifts.id, g.id))
      await t.update(claims).set({ estado: 'liberado', updatedAt: new Date() }).where(eq(claims.id, g.claimId))
      await t.update(items).set({ estadoDueno: 'no_lo_quiero' })
        .where(and(eq(items.id, g.itemId), inArray(items.listId, t.select({ id: lists.id }).from(lists).where(eq(lists.tipo, 'sorpresa')))))
      const estaban = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
        .where(and(eq(groupGiftMembers.giftId, g.id), ne(groupGiftMembers.userId, userId)))
      await dejarAviso(t, g.itemId, 'regalo_cancelado', estaban.map((m) => ({ userId: m.userId, guestId: null })))
    }
    // Los que organizaba y ya están cancelados no son de nadie más: se van, con quienes se habían sumado.
    const cancelados = t.select({ id: groupGifts.id }).from(groupGifts).where(and(eq(groupGifts.organizerUserId, userId), ne(groupGifts.estado, 'comprado')))
    await t.delete(invitacionesRegalo).where(inArray(invitacionesRegalo.giftId, cancelados))
    await t.delete(groupGiftSacados).where(inArray(groupGiftSacados.giftId, cancelados))
    await t.delete(groupGiftMembers).where(inArray(groupGiftMembers.giftId, cancelados))
    await t.delete(groupGifts).where(and(eq(groupGifts.organizerUserId, userId), ne(groupGifts.estado, 'comprado')))
    await t.delete(invitacionesRegalo).where(or(eq(invitacionesRegalo.deUserId, userId), eq(invitacionesRegalo.paraUserId, userId)))
    await t.delete(groupGiftSacados).where(eq(groupGiftSacados.userId, userId))
    // De los que no organizaba y no se compraron, sale. Los ya comprados tienen partes y pagos anotados entre varios: su
    // lugar pasa a "Cuenta eliminada" (lo que le debían o debía queda a ese nombre).
    await t.delete(groupGiftMembers).where(and(eq(groupGiftMembers.userId, userId),
      inArray(groupGiftMembers.giftId, t.select({ id: groupGifts.id }).from(groupGifts).where(ne(groupGifts.estado, 'comprado')))))
    const [enComprados] = await t.select({ giftId: groupGiftMembers.giftId }).from(groupGiftMembers).where(eq(groupGiftMembers.userId, userId)).limit(1)
    if (enComprados) await t.update(groupGiftMembers).set({ userId: await eliminada() }).where(eq(groupGiftMembers.userId, userId))
    const [organiza] = await t.select({ id: groupGifts.id }).from(groupGifts).where(eq(groupGifts.organizerUserId, userId)).limit(1)
    if (organiza) await t.update(groupGifts).set({ organizerUserId: await eliminada() }).where(eq(groupGifts.organizerUserId, userId))

    // ---- lo que reservó o compró: lo reservado se libera; lo comprado sigue comprado (nadie lo duplica), sin su nombre
    // ni lo que escribió. Sus aportes en plata se van enteros, con lo que anotó: un aporte no ocupa nada (nadie lo
    // "duplica"), así que no hace falta que quede a nombre de "Cuenta eliminada" como una compra.
    const deAportes = t.select({ id: items.id }).from(items).where(eq(items.tipo, 'aporte'))
    await t.delete(claims).where(and(eq(claims.claimerUserId, userId), inArray(claims.itemId, deAportes)))
    await t.delete(claims).where(and(eq(claims.claimerUserId, userId), ne(claims.estado, 'comprado'),
      notExists(t.select({ uno: sql`1` }).from(groupGifts).where(eq(groupGifts.claimId, claims.id)))))
    const [compro] = await t.select({ id: claims.id }).from(claims).where(eq(claims.claimerUserId, userId)).limit(1)
    if (compro) await t.update(claims).set({ claimerUserId: await eliminada(), notaQueCompre: null }).where(eq(claims.claimerUserId, userId))

    // ---- lo que hizo como invitado antes de unirlo a la cuenta (ver unirInvitadoACuenta): lo mismo
    const invitados = await t.select({ id: guestIdentities.id }).from(guestIdentities).where(eq(guestIdentities.promotedToUserId, userId))
    for (const g of invitados) {
      await t.delete(claims).where(and(eq(claims.claimerGuestId, g.id), or(ne(claims.estado, 'comprado'), inArray(claims.itemId, deAportes))))
      await t.delete(comments).where(eq(comments.authorGuestId, g.id))
      await t.delete(notifications).where(eq(notifications.guestId, g.id))
      await t.delete(codazos).where(eq(codazos.deGuestId, g.id))
      await t.delete(listasDeInvitado).where(eq(listasDeInvitado.guestId, g.id))
      const [compras] = await t.select({ id: claims.id }).from(claims).where(eq(claims.claimerGuestId, g.id)).limit(1)
      if (compras) {
        await t.update(claims).set({ notaQueCompre: null }).where(eq(claims.claimerGuestId, g.id))
        await t.update(guestIdentities).set({ nombre: CUENTA_ELIMINADA, email: null, promotedToUserId: await eliminada() }).where(eq(guestIdentities.id, g.id))
      } else await t.delete(guestIdentities).where(eq(guestIdentities.id, g.id))
    }

    // ---- sorpresas: las que le armaban a él siguen siendo de los que las armaron; las que armó él con otros, también
    const [paraEl] = await t.select({ id: lists.id }).from(lists).where(eq(lists.paraUserId, userId)).limit(1)
    if (paraEl) await t.update(lists).set({ paraUserId: await eliminada() }).where(eq(lists.paraUserId, userId))
    const [armadas] = await t.select({ id: lists.id }).from(lists).where(eq(lists.creadaPor, userId)).limit(1)
    if (armadas) await t.update(lists).set({ creadaPor: await eliminada() }).where(eq(lists.creadaPor, userId))

    // ---- amigo invisible. Uno que organizaba y no sorteó (despedirse no llegó): se va. En uno ya sorteado queda su
    // lugar, para que los demás conserven a quién les tocó; lo que preguntó y lo que le preguntaron, no.
    await t.delete(amigosInvisibles).where(and(eq(amigosInvisibles.organizadorId, userId), isNull(amigosInvisibles.sorteadoAt)))
    await t.delete(amigoInvisiblePreguntas).where(or(eq(amigoInvisiblePreguntas.deUserId, userId), eq(amigoInvisiblePreguntas.paraUserId, userId)))
    await t.delete(amigoInvisibleExcluidos).where(or(eq(amigoInvisibleExcluidos.a, userId), eq(amigoInvisibleExcluidos.b, userId)))
    const sorteados = t.select({ id: amigosInvisibles.id }).from(amigosInvisibles).where(isNotNull(amigosInvisibles.sorteadoAt))
    await t.delete(amigoInvisibleGente).where(and(eq(amigoInvisibleGente.userId, userId),
      or(ne(amigoInvisibleGente.estado, 'juega'), notInArray(amigoInvisibleGente.amigoInvisibleId, sorteados))))
    const juega = (await t.select({ id: amigoInvisibleGente.amigoInvisibleId }).from(amigoInvisibleGente).where(eq(amigoInvisibleGente.userId, userId))).map((j) => j.id)
    if (juega.length) {
      const f = await eliminada()
      await t.update(amigoInvisibleGente).set({ userId: f }).where(eq(amigoInvisibleGente.userId, userId))
      await t.update(amigoInvisibleGente).set({ regalaA: f })
        .where(and(eq(amigoInvisibleGente.regalaA, userId), inArray(amigoInvisibleGente.amigoInvisibleId, juega)))
    }
    await t.update(amigoInvisibleGente).set({ regalaA: null }).where(eq(amigoInvisibleGente.regalaA, userId))
    const [organizaJuego] = await t.select({ id: amigosInvisibles.id }).from(amigosInvisibles).where(eq(amigosInvisibles.organizadorId, userId)).limit(1)
    // sin quien lo organice no entra nadie más: el link deja de servir
    if (organizaJuego) {
      await t.update(amigosInvisibles).set({ organizadorId: await eliminada(), inviteToken: null, altasCerradasAt: sql`coalesce(${amigosInvisibles.altasCerradasAt}, now())` })
        .where(eq(amigosInvisibles.organizadorId, userId))
    }

    // ---- lo que es solo suyo
    await t.delete(comments).where(eq(comments.authorUserId, userId))
    await t.delete(notifications).where(eq(notifications.userId, userId))
    // los avisos que les mandó a otros también: llevan su nombre ("Rodri quiere ser tu amigo")
    await t.delete(avisos).where(or(eq(avisos.userId, userId), eq(avisos.deUserId, userId)))
    await t.delete(codazos).where(or(eq(codazos.paraUserId, userId), eq(codazos.deUserId, userId)))
    await t.delete(amistades).where(or(eq(amistades.deUserId, userId), eq(amistades.paraUserId, userId)))
    await t.delete(listFollows).where(eq(listFollows.userId, userId))
    await t.delete(pushSubs).where(eq(pushSubs.userId, userId))
    await t.delete(pedidosAfuera).where(eq(pedidosAfuera.userId, userId))
    await t.delete(recordatoriosEnviados).where(eq(recordatoriosEnviados.userId, userId))
    await t.delete(fotosPerfil).where(eq(fotosPerfil.userId, userId))

    // ---- las fotos de deseos que subió. Las que todavía usa un deseo de otro (uno de una lista en común que sigue, o
    // uno que alguien se llevó a su lista con "Me lo robo") pasan a quien lo tiene; las demás se van.
    const enUso = await t.select({ id: fotosDeseo.id }).from(fotosDeseo).where(and(eq(fotosDeseo.userId, userId), or(
      exists(t.select({ uno: sql`1` }).from(items).where(sql`${idDeFotoDeseo(items.fotoUrl)} = ${fotosDeseo.id}::text`)),
      exists(t.select({ uno: sql`1` }).from(lists).where(sql`${idDeFotoDeseo(lists.fotoUrl)} = ${fotosDeseo.id}::text`)),
    )))
    for (const f of enUso) {
      const donde = t.select({ id: items.listId }).from(items).where(sql`${idDeFotoDeseo(items.fotoUrl)} = ${f.id}`)
      const [lista] = await t.select({
        ownerId: lists.ownerId, creadaPor: lists.creadaPor,
        miembro: sql<string | null>`(select m.user_id from ${listMembers} m where m.list_id = ${lists.id} and m.salio_at is null order by m.created_at limit 1)`,
      }).from(lists).where(or(inArray(lists.id, donde), sql`${idDeFotoDeseo(lists.fotoUrl)} = ${f.id}`)).limit(1)
      await t.update(fotosDeseo).set({ userId: lista?.ownerId ?? lista?.miembro ?? lista?.creadaPor ?? await eliminada() }).where(eq(fotosDeseo.id, f.id))
    }
    await t.delete(fotosDeseo).where(eq(fotosDeseo.userId, userId))

    await t.delete(users).where(eq(users.id, userId))
    return true
  })
  // Con la cuenta ya borrada (si no se borró, no se le dice nada a nadie), a los que tenían algo reservado o comprado en
  // sus listas: les desapareció de sus regalos, y sin una línea no sabrían por qué. Sin nombres ni deseos: de la cuenta
  // borrada no queda nada escrito.
  if (borrada) {
    await Promise.all(regalaban.map((quien) => avisar(db, quien, {
      tipo: null, title: '🎁 Una lista donde ibas a regalar ya no está',
      body: 'Quien la armó borró su cuenta de GiftR: lo que habías reservado o comprado ahí ya no aparece entre tus regalos.',
      url: '/inicio',
    }, enviar).catch(() => 0)))
  }
  return borrada
}
