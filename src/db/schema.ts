import { pgTable, uuid, text, integer, boolean, timestamp, primaryKey, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleId: text('google_id').notNull().unique(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const listMembers = pgTable('list_members', {
  listId: uuid('list_id').notNull().references(() => lists.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.listId, t.userId] }), index('list_members_user_id_idx').on(t.userId)])

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

export const guestIdentities = pgTable('guest_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  nombre: text('nombre').notNull(),
  email: text('email'),
  promotedToUserId: uuid('promoted_to_user_id').references(() => users.id),
})

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
