import { pgTable, uuid, text, integer, smallint, boolean, timestamp, date, jsonb, primaryKey, index, customType } from 'drizzle-orm/pg-core'
import type { Gustos } from '@/lib/gustos'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleId: text('google_id').notNull().unique(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
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
})

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

// Foto de un deseo subida desde el teléfono (galería, cámara o pegada): JPEG de hasta 1200px, sin metadatos.
// El deseo la usa como /foto/deseo/:id; se sube antes de guardar el deseo, por eso no apunta a items.
export const fotosDeseo = pgTable('fotos_deseo', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  datos: bytea('datos').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

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
  // Fecha del grupo ("cumplen el 12/10"); anual se repite todos los años, si no es una sola vez.
  eventoFecha: date('evento_fecha'),
  eventoAnual: boolean('evento_anual').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Listas que un usuario abrió como regalador: su gente. Sus cumples y fechas aparecen en Eventos.
export const listFollows = pgTable('list_follows', {
  userId: uuid('user_id').notNull().references(() => users.id),
  listId: uuid('list_id').notNull().references(() => lists.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.listId] })])

export const listMembers = pgTable('list_members', {
  listId: uuid('list_id').notNull().references(() => lists.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Cuándo salió del grupo. La fila queda: ya no edita, pero sigue sin ver la capa oculta de lo que armó (ver acceso.ts).
  salioAt: timestamp('salio_at', { withTimezone: true }),
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
})

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
})

export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  authorUserId: uuid('author_user_id').references(() => users.id),
  authorGuestId: uuid('author_guest_id').references(() => guestIdentities.id),
  texto: text('texto').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  guestId: uuid('guest_id').references(() => guestIdentities.id),
  tipo: text('tipo', { enum: ['item_baja', 'item_editado'] }).notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  leida: boolean('leida').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Regalo grupal: un encargado (organizer) lo compra y paga; los demás se suman y le deben su parte.
// Reserva el deseo con un claim propio (sin vencimiento) para que nadie lo duplique.
export const groupGifts = pgTable('group_gifts', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  claimId: uuid('claim_id').notNull().references(() => claims.id).unique(),
  organizerUserId: uuid('organizer_user_id').notNull().references(() => users.id),
  estado: text('estado', { enum: ['abierto', 'comprado', 'cancelado'] }).notNull().default('abierto'),
  montoTotal: integer('monto_total'), // pesos; se fija al comprar
  compradoAt: timestamp('comprado_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groupGiftMembers = pgTable('group_gift_members', {
  giftId: uuid('gift_id').notNull().references(() => groupGifts.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  monto: integer('monto'), // su parte en pesos; el encargado también tiene la suya
  pagado: boolean('pagado').notNull().default(false),
  pagadoAt: timestamp('pagado_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.giftId, t.userId] }), index('group_gift_members_user_id_idx').on(t.userId)])

// Configuración que genera la app sola (las claves VAPID de los avisos push): nadie las carga a mano.
export const config = pgTable('config', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
})

// Dispositivos donde un usuario activó los avisos (Web Push). Uno por navegador/teléfono.
export const pushSubs = pgTable('push_subs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('push_subs_user_id_idx').on(t.userId)])

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
}, (t) => [index('codazos_para_user_id_idx').on(t.paraUserId)])
