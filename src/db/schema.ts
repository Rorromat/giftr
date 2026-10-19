import { pgTable, uuid, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleId: text('google_id').notNull().unique(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
})

export const lists = pgTable('lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id).unique(), // una lista por usuario en Fase 1
  shareToken: text('share_token').notNull().unique(),
})

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
