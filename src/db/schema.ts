import { sql, type SQL } from 'drizzle-orm'
import { pgTable, uuid, text, integer, smallint, boolean, timestamp, date, jsonb, primaryKey, index, uniqueIndex, customType, type AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Gustos } from '@/lib/gustos'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleId: text('google_id').notNull().unique(),
  nombre: text('nombre').notNull(),
  // El último email que dio Google para esta cuenta, solo como dato. No es único ni identifica a nadie (eso es google_id):
  // si Google le da ese email a otra cuenta (una de trabajo que se borró y se volvió a crear, o una dirección que pasó a
  // otra persona), entra como alguien nuevo. Unirla a la vieja por el email le daría las reservas y listas del otro.
  email: text('email').notNull(),
  avatarUrl: text('avatar_url'),
  // Cumpleaños sin año (alimenta Eventos de la gente que sigue su lista).
  cumpleDia: smallint('cumple_dia'),
  cumpleMes: smallint('cumple_mes'),
  // Gustos de la bienvenida (deportes, club, marcas, talles…): pistas para los que regalan.
  gustos: jsonb('gustos').$type<Gustos>(),
  // Cuándo pasó por la bienvenida (la completó o la salteó). Vacío: se la mostramos al entrar.
  bienvenidaAt: timestamp('bienvenida_at', { withTimezone: true }),
  // Cuándo subió su foto de perfil (versiona la URL /foto/:id). Vacío: se usa la de Google o las iniciales.
  fotoAt: timestamp('foto_at', { withTimezone: true }),
  // Cuándo tocó "Probar" en Avisos por última vez: uno por minuto (ver probarAviso).
  avisoProbadoAt: timestamp('aviso_probado_at', { withTimezone: true }),
  // Cuándo le preguntamos si quería avisos: en la bienvenida o, a los que ya estaban, con el cartel de una sola vez (ver
  // preguntarAvisos). Vacío: todavía no.
  avisosPreguntadosAt: timestamp('avisos_preguntados_at', { withTimezone: true }),
  // El nombre de usuario ("euge.mateus", sin la @), para que lo encuentren y lo agreguen como amigo. Se le sugiere uno al
  // entrar (ver asegurarUsuario) y lo cambia en Perfil. En minúsculas, único.
  usuario: text('usuario').unique(),
  // El link para sumarse como amigo (/amigo/<token>): quien lo abre y acepta queda amigo sin otra solicitud. Se crea la
  // primera vez que se comparte.
  amigoToken: text('amigo_token').unique(),
}, (t) => [
  // las solicitudes de amistad por mail: a quién le llegan (el mail de Google, sin importar mayúsculas)
  index('users_email_lower_idx').on(sql`lower(${t.email})`),
])

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => Buffer.from(v),
})

// Foto de perfil subida por el usuario: JPEG chico (400x400, sin metadatos). Aparte de users para no traerla en cada consulta.
export const fotosPerfil = pgTable('fotos_perfil', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  datos: bytea('datos').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * El id de la foto subida que usa un foto_url (/foto/deseo/:id, o un link entero a esa ruta, con lo que siga), en
 * minúsculas; null si no usa ninguna. La limpieza de fotos (guardarFotoDeseo) busca con esto, y el índice de items es
 * sobre esto mismo: si no, para cada foto recorría todos los deseos de la base.
 */
export const idDeFotoDeseo = (fotoUrl: AnyPgColumn): SQL => sql`lower(substring(${fotoUrl} from '/foto/deseo/([0-9A-Fa-f-]{36})'))`

// Foto de un deseo subida desde el teléfono (galería, cámara o pegada): JPEG de hasta 1200px, sin metadatos.
// El deseo la usa como /foto/deseo/:id; se sube antes de guardar el deseo, por eso no apunta a items.
// Índice por usuario y fecha: el cupo de subidas por día y la limpieza de las que nadie usa (ver guardarFotoDeseo).
export const fotosDeseo = pgTable('fotos_deseo', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  datos: bytea('datos').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('fotos_deseo_user_id_created_at_idx').on(t.userId, t.createdAt)])

// Cada vez que un usuario nos hace pedir algo afuera (leer la página del link de un producto, traer su foto): solo
// para el tope por día y por rato (ver anotarPedidoAfuera). No se guarda el link. Índice por usuario y fecha: el conteo
// y la limpieza de las de más de un día.
export const pedidosAfuera = pgTable('pedidos_afuera', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pedidos_afuera_user_id_created_at_idx').on(t.userId, t.createdAt)])

// Dos tipos de lista:
// - personal: una por usuario, su dueño es owner_id (único).
// - grupo: una lista en común ("Nuestra casa"); owner_id queda vacío y sus dueños están en list_members.
//   Los que regalan la ven como una sola lista por share_token; invite_token suma co-dueños.
export const lists = pgTable('lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').references(() => users.id).unique(),
  shareToken: text('share_token').notNull().unique(),
  tipo: text('tipo', { enum: ['personal', 'grupo'] }).notNull().default('personal'),
  nombre: text('nombre'),
  descripcion: text('descripcion'),
  inviteToken: text('invite_token').unique(),
  // Cuándo se cambió el link para regalar por última vez (vacío: nunca). Lo de antes de esa fecha no lleva al link nuevo.
  shareTokenAt: timestamp('share_token_at', { withTimezone: true }),
  // Fecha del grupo ("cumplen el 12/10"); anual se repite todos los años, si no es una sola vez.
  eventoFecha: date('evento_fecha'),
  eventoAnual: boolean('evento_anual').notNull().default(true),
  // Al cambiar o quitar la fecha del grupo, desde cuándo lo comprado era para el evento que venía (vacío: sin corte): lo
  // de antes es del que ya pasó aunque la fecha nueva no lo encuentre (ver desdeElUltimoEvento).
  corteEvento: timestamp('corte_evento', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Listas que un usuario abrió como regalador: su gente. Sus cumples y fechas aparecen en Eventos.
// Índice por lista: al cambiar el link para regalar se borran los que la seguían (la clave empieza por el usuario).
export const listFollows = pgTable('list_follows', {
  userId: uuid('user_id').notNull().references(() => users.id),
  listId: uuid('list_id').notNull().references(() => lists.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.listId] }), index('list_follows_list_id_idx').on(t.listId)])

export const listMembers = pgTable('list_members', {
  listId: uuid('list_id').notNull().references(() => lists.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Cuándo salió del grupo. La fila queda: ya no edita, pero sigue sin ver la capa oculta de lo que armó (ver acceso.ts).
  salioAt: timestamp('salio_at', { withTimezone: true }),
  // La última vez que se sumó (o volvió) al grupo. created_at no cambia al volver (y da la antigüedad, ver sacarDelGrupo).
  // Lo que un invitado dijo de esta lista antes de esa fecha ya no vale: puede ser este mismo, ahora dueño (ver accesoALista).
  unidoAt: timestamp('unido_at', { withTimezone: true }).notNull().defaultNow(),
},(t) => [primaryKey({ columns: [t.listId, t.userId] }), index('list_members_user_id_idx').on(t.userId)])

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id),
  tipo: text('tipo', { enum: ['exacto', 'idea'] }).notNull(),
  titulo: text('titulo').notNull(),
  notas: text('notas'),
  fotoUrl: text('foto_url'),
  precio: text('precio'),
  rangoPrecio: text('rango_precio'),
  categoria: text('categoria'),
  prioridad: text('prioridad', { enum: ['mucho', 'gustaria', 'suelta'] }).notNull().default('gustaria'),
  cantidad: integer('cantidad').notNull().default(1),
  repetible: boolean('repetible').notNull().default(false),
  estadoDueno: text('estado_dueno', { enum: ['activo', 'lo_tengo', 'no_lo_quiero'] }).notNull().default('activo'),
  linkTienda: text('link_tienda'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Al volverlo a poner (ver restoreItem), lo comprado para un evento anterior ya se regaló: lo de antes de esta fecha no
  // ocupa (ver ocupaSql). Null: nunca volvió, ocupa todo lo comprado (salvo en una idea que se puede repetir).
  ocupaDesde: timestamp('ocupa_desde', { withTimezone: true }),
}, (t) => [
  index('items_foto_deseo_idx').on(idDeFotoDeseo(t.fotoUrl)),
  // los deseos de una lista, en el orden en que se cargaron: cada vista de lista, la vista previa y Eventos
  index('items_list_id_created_at_idx').on(t.listId, t.createdAt),
])

// Un invitado por link: solo su nombre. Su credencial es la cookie con el id firmado (src/lib/cookie-invitado.ts).
export const guestIdentities = pgTable('guest_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  nombre: text('nombre').notNull(),
  // De antes: ya no se pide ni se usa para unirlo a una cuenta (nadie lo verificaba).
  email: text('email'),
  promotedToUserId: uuid('promoted_to_user_id').references(() => users.id),
})

// Listas donde un invitado dijo que no son suyas (se anotó ahí, reservó o tocó "Ver lo reservado"): solo en esas ve
// la capa oculta. Su nombre vale para todo el navegador, y en otra lista puede ser el dueño sin su sesión.
export const listasDeInvitado = pgTable('listas_de_invitado', {
  guestId: uuid('guest_id').notNull().references(() => guestIdentities.id),
  listId: uuid('list_id').notNull().references(() => lists.id),
  // La última vez que lo dijo, siempre con el link para regalar de ahora (ver abrirListaAInvitado).
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.guestId, t.listId] })])

export const claims = pgTable('claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  claimerUserId: uuid('claimer_user_id').references(() => users.id),
  claimerGuestId: uuid('claimer_guest_id').references(() => guestIdentities.id),
  estado: text('estado', { enum: ['reservado', 'comprado', 'liberado', 'expirado'] }).notNull().default('reservado'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  notaQueCompre: text('nota_que_compre'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // lo reservado de un deseo (cada vista, y el conteo de reserveItem con el deseo bloqueado)
  index('claims_item_id_estado_idx').on(t.itemId, t.estado),
  // lo de cada persona: los carteles de "¿Lo conseguiste?" en cada pantalla y la unión del invitado a su cuenta
  index('claims_claimer_user_id_idx').on(t.claimerUserId),
  index('claims_claimer_guest_id_idx').on(t.claimerGuestId),
  // expireStaleClaims sin deseo corre en cada pantalla: solo mira las reservadas que tienen vencimiento
  index('claims_vencen_idx').on(t.expiresAt).where(sql`${t.estado} = 'reservado'`),
])

export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  authorUserId: uuid('author_user_id').references(() => users.id),
  authorGuestId: uuid('author_guest_id').references(() => guestIdentities.id),
  texto: text('texto').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('comments_item_id_created_at_idx').on(t.itemId, t.createdAt)])

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  guestId: uuid('guest_id').references(() => guestIdentities.id),
  // regalo_encargo: ahora organiza un regalo grupal. regalo_cancelado: el regalo grupal en el que estaba se canceló.
  // regalo_sacado: el encargado lo sacó del regalo grupal. compra_corregida: el encargado corrigió la compra y le cambió la parte.
  // item_baja_comprado: ya lo había comprado y el dueño dijo "Ya no lo quiero". regalo_baja: estaba en un regalo grupal
  // abierto de un deseo que el dueño ya no quiere (el regalo se canceló); regalo_lo_tiene: el dueño dijo "Ya lo tengo" y el
  // regalo sigue abierto para dividirlo o cancelarlo desde Cuentas. Cuando el dueño lo vuelve a poner: item_vuelve, se le
  // había liberado la reserva; compra_vuelve / regalo_vuelve, lo había comprado (suelto o en un regalo grupal).
  tipo: text('tipo', {
    enum: [
      'item_baja', 'item_editado', 'regalo_encargo', 'regalo_cancelado', 'item_baja_comprado', 'regalo_baja', 'regalo_lo_tiene',
      'item_vuelve', 'compra_vuelve', 'regalo_vuelve', 'regalo_sacado', 'compra_corregida',
    ],
  }).notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  leida: boolean('leida').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // los avisos de cada uno (Banners, en cada pantalla) y los de un deseo (al editarlo o volver a ponerlo)
  index('notifications_user_id_idx').on(t.userId),
  index('notifications_guest_id_idx').on(t.guestId),
  index('notifications_item_id_idx').on(t.itemId),
])

// Regalo grupal: un encargado (organizer) lo compra y paga; los demás se suman y le deben su parte.
// Reserva el deseo con un claim propio (sin vencimiento) para que nadie lo duplique.
export const groupGifts = pgTable('group_gifts', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  claimId: uuid('claim_id').notNull().references(() => claims.id).unique(),
  organizerUserId: uuid('organizer_user_id').notNull().references(() => users.id),
  estado: text('estado', { enum: ['abierto', 'comprado', 'cancelado'] }).notNull().default('abierto'),
  montoTotal: integer('monto_total'), // en su moneda; se fija al comprar
  // en qué se cuenta: el total, las partes de los miembros y lo de Cuentas (enteros: pesos o dólares)
  moneda: text('moneda', { enum: ['ARS', 'USD'] }).notNull().default('ARS'),
  compradoAt: timestamp('comprado_at', { withTimezone: true }),
  // el encargado dijo "Sigue en pie" al recordatorio de cerrarlo: el próximo cuenta desde acá (ver regalosParaCerrar)
  recordatorioAt: timestamp('recordatorio_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // los regalos de un deseo (su detalle) y los que organiza cada uno (Cuentas)
  index('group_gifts_item_id_idx').on(t.itemId),
  index('group_gifts_organizer_user_id_idx').on(t.organizerUserId),
])

export const groupGiftMembers = pgTable('group_gift_members', {
  giftId: uuid('gift_id').notNull().references(() => groupGifts.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  monto: integer('monto'), // su parte en pesos; el encargado también tiene la suya
  pagado: boolean('pagado').notNull().default(false),
  pagadoAt: timestamp('pagado_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.giftId, t.userId] }), index('group_gift_members_user_id_idx').on(t.userId)])

// A quién sacó el encargado de un regalo grupal: no se vuelve a sumar con un toque (ver sacarDeRegalo), salvo que el
// encargado lo deje volver. Aparte de los miembros: el que sacan no está en el regalo, para ninguna cuenta ni vista.
export const groupGiftSacados = pgTable('group_gift_sacados', {
  giftId: uuid('gift_id').notNull().references(() => groupGifts.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.giftId, t.userId] })])

// Configuración que genera la app sola (las claves VAPID de los avisos push): nadie las carga a mano.
export const config = pgTable('config', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
})

// Dispositivos donde un usuario activó los avisos (Web Push). Uno por navegador/teléfono, como mucho 10 por usuario.
// created_at: cuándo se activó o se confirmó por última vez (al abrir Perfil); con el tope se van las más viejas.
export const pushSubs = pgTable('push_subs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('push_subs_user_id_idx').on(t.userId)])

// Amigos: una solicitud de uno a otro y, si la acepta, se ven mutuamente (cada uno sigue la lista personal del otro, ver
// amigos.ts). Una fila por par: la misma pasa de pendiente a aceptada o rechazada. Por mail, si nadie entró todavía con
// ese mail, para_user_id queda vacío hasta que entre (ver reclamarSolicitudesPorMail).
export const amistades = pgTable('amistades', {
  id: uuid('id').defaultRandom().primaryKey(),
  deUserId: uuid('de_user_id').notNull().references(() => users.id),
  paraUserId: uuid('para_user_id').references(() => users.id),
  // el mail que escribió el que la mandó, en minúsculas: lo que ve en sus enviadas (no el nombre de la cuenta de ese mail)
  paraEmail: text('para_email'),
  estado: text('estado', { enum: ['pendiente', 'aceptada', 'rechazada'] }).notNull().default('pendiente'),
  // el que la mandó la sacó de sus enviadas cuando ya estaba rechazada: queda, así no le vuelve a llegar al otro
  ocultaAt: timestamp('oculta_at', { withTimezone: true }),
  respondidaAt: timestamp('respondida_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // una por par, sin importar quién la mandó
  uniqueIndex('amistades_par_idx').on(sql`least(${t.deUserId}, ${t.paraUserId})`, sql`greatest(${t.deUserId}, ${t.paraUserId})`)
    .where(sql`${t.paraUserId} is not null`),
  // y una por mail que todavía no es de nadie
  uniqueIndex('amistades_mail_idx').on(t.deUserId, t.paraEmail).where(sql`${t.paraUserId} is null`),
  index('amistades_para_user_id_idx').on(t.paraUserId),
  index('amistades_de_user_id_created_at_idx').on(t.deUserId, t.createdAt),
  index('amistades_para_email_idx').on(t.paraEmail).where(sql`${t.paraUserId} is null`),
])

// Codazos: alguien que regala le pide a un dueño que cargue su lista. Uno por persona y lista cada 24 h.
export const codazos = pgTable('codazos', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id),
  paraUserId: uuid('para_user_id').notNull().references(() => users.id),
  deUserId: uuid('de_user_id').references(() => users.id),
  deGuestId: uuid('de_guest_id').references(() => guestIdentities.id),
  deNombre: text('de_nombre').notNull(),
  visto: boolean('visto').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('codazos_para_user_id_idx').on(t.paraUserId),
  // los topes del codazo: los de una lista en las últimas 24 horas
  index('codazos_list_id_created_at_idx').on(t.listId, t.createdAt),
])
