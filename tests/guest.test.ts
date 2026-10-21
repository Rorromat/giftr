import { expect, test, vi } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, codazos, comments, guestIdentities, items, lists, notifications, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getMyClaimWarnings, markBought, releaseClaim, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { createGuest, unirInvitadoACuenta, validarNombre, viewerDeCookie } from '@/lib/guest'
import { firmarInvitado, leerInvitado } from '@/lib/cookie-invitado'
import { getUnreadNotifications } from '@/lib/notifications'
import { asegurarListaPropia, upsertUserFromGoogle } from '@/lib/users'
import { getItemForViewer, getListForViewer, getOwnList } from '@/lib/lists'
import { crearGrupo } from '@/lib/groups'
import { createItem, updateItem } from '@/lib/items'

test('un guest puede reservar', async () => {
  const db = await createTestDb()
  const { list } = await seedOwnerAndGiver(db)
  const [item] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const guest = await createGuest(db, 'Abuela')
  const r = await reserveItem(db, item.id, { guestId: guest.id })
  expect(r.ok).toBe(true)
})

test('el nombre del invitado se recorta y tiene que tener entre 1 y 60 caracteres', async () => {
  expect(validarNombre('  Abuela   Marta ')).toEqual({ ok: true, nombre: 'Abuela Marta' })
  expect(validarNombre('   ')).toMatchObject({ ok: false, motivo: 'vacio' })
  expect(validarNombre(undefined)).toMatchObject({ ok: false, motivo: 'vacio' })
  expect(validarNombre('a'.repeat(61))).toMatchObject({ ok: false, motivo: 'largo' })
  // un emoji cuenta como un caracter
  expect(validarNombre('🎁'.repeat(60))).toMatchObject({ ok: true })
  const db = await createTestDb()
  await expect(createGuest(db, '  ')).rejects.toThrow()
  const g = await createGuest(db, ' Tía  Marta ')
  const [fila] = await db.select().from(guestIdentities).where(eq(guestIdentities.id, g.id))
  expect(fila.nombre).toBe('Tía Marta')
})

test('la cookie de invitado vale solo firmada, de un invitado que existe y no se unió a una cuenta', async () => {
  const db = await createTestDb()
  const { owner } = await seedOwnerAndGiver(db)
  const abuela = await createGuest(db, 'Abuela')
  const otro = await createGuest(db, 'Otro')

  expect(await viewerDeCookie(db, firmarInvitado(abuela.id))).toEqual({ guestId: abuela.id })
  // las cookies viejas (el id pelado) ya no sirven: el id se podía filtrar y alcanzaba para hacerse pasar por él
  expect(await viewerDeCookie(db, abuela.id)).toEqual({})
  // el id de otro con mi firma, o la firma tocada
  expect(await viewerDeCookie(db, `${abuela.id}.${firmarInvitado(otro.id).split('.')[1]}`)).toEqual({})
  expect(await viewerDeCookie(db, `${firmarInvitado(abuela.id)}x`)).toEqual({})
  // basura (antes reventaba Postgres al compararla con una columna uuid)
  for (const basura of ['xxx', '', '.', 'xxx.yyy', undefined]) expect(await viewerDeCookie(db, basura)).toEqual({})
  // bien firmada pero de un invitado que no existe (una base restaurada)
  expect(await viewerDeCookie(db, firmarInvitado('8a1f3c2e-0000-4000-8000-000000000000'))).toEqual({})
  // ya se unió a una cuenta: sin sesión vuelve a ser alguien sin identificar
  await db.update(guestIdentities).set({ promotedToUserId: owner.id }).where(eq(guestIdentities.id, abuela.id))
  expect(await viewerDeCookie(db, firmarInvitado(abuela.id))).toEqual({})

  expect(leerInvitado(firmarInvitado(otro.id))).toBe(otro.id)
})

test('la firma usa AUTH_SECRET y en producción sin esa variable falla claro', () => {
  const id = '8a1f3c2e-0000-4000-8000-000000000000'
  const deDesarrollo = firmarInvitado(id)
  try {
    vi.stubEnv('AUTH_SECRET', 'otro-secreto')
    expect(firmarInvitado(id)).not.toBe(deDesarrollo)
    expect(leerInvitado(deDesarrollo)).toBeNull()
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => firmarInvitado(id)).toThrow(/AUTH_SECRET/)
  } finally {
    vi.unstubAllEnvs()
  }
})

test('al entrar con Google en el navegador del invitado, la cuenta hereda sus reservas, comentarios, avisos y codazos', async () => {
  const db = await createTestDb()
  const { list, owner } = await seedOwnerAndGiver(db)
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const ana = await createGuest(db, 'Ana') // sin email: ya no hace falta
  const r = await reserveItem(db, termo.id, { guestId: ana.id })
  if (!r.ok) throw new Error(r.reason)
  await addComment(db, termo.id, { guestId: ana.id }, 'lo compro el sábado')
  await updateItem(db, termo.id, owner.id, { notas: 'el verde' }) // le deja un aviso
  await db.insert(codazos).values({ listId: list.id, paraUserId: owner.id, deGuestId: ana.id, deNombre: 'Ana' })

  const user = await upsertUserFromGoogle(db, { googleId: 'g-ana', email: 'ana.otra@test.com', nombre: 'Ana P' })
  expect(await unirInvitadoACuenta(db, ana.id, user.id)).toBe(true)

  const [c] = await db.select().from(claims)
  expect(c).toMatchObject({ claimerUserId: user.id, claimerGuestId: null })
  const [com] = await db.select().from(comments)
  expect(com).toMatchObject({ authorUserId: user.id, authorGuestId: null })
  const [n] = await db.select().from(notifications)
  expect(n).toMatchObject({ userId: user.id, guestId: null })
  const [cod] = await db.select().from(codazos)
  expect(cod).toMatchObject({ deUserId: user.id, deGuestId: null })
  // y la sigue manejando con su cuenta
  const vista = await getListForViewer(db, 'tok-euge', { userId: user.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.items[0].claims[0].esMia).toBe(true)
  expect(await markBought(db, r.claimId, { userId: user.id })).toBe(true)
  // no se une dos veces
  expect(await unirInvitadoACuenta(db, ana.id, user.id)).toBe(false)
})

test('el email ya no une invitados: un invitado con el email de la dueña no le pasa nada al entrar', async () => {
  const db = await createTestDb()
  const { list } = await seedOwnerAndGiver(db)
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  // un invitado de antes, que escribió el email de Euge
  const [abuela] = await db.insert(guestIdentities).values({ nombre: 'Abuela', email: 'euge@test.com' }).returning()
  const r = await reserveItem(db, termo.id, { guestId: abuela.id })
  if (!r.ok) throw new Error(r.reason)

  const euge = await upsertUserFromGoogle(db, { googleId: 'g-owner', email: 'euge@test.com', nombre: 'Euge' })
  const [c] = await db.select().from(claims)
  expect(c).toMatchObject({ claimerGuestId: abuela.id, claimerUserId: null })
  expect(await getMyClaimWarnings(db, { userId: euge.id })).toEqual([])
  // la abuela la sigue manejando con su cookie
  expect(await releaseClaim(db, r.claimId, { guestId: abuela.id })).toBe(true)
})

test('lo que el invitado hizo en listas de la cuenta (propia o de un grupo) queda a su nombre y no le llega nada', async () => {
  const db = await createTestDb()
  const { list, owner, giver } = await seedOwnerAndGiver(db)
  // Euge también arma un grupo
  const grupoId = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const cafetera = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Cafetera' }, grupoId))!
  const [deRodri] = await db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  const [mate] = await db.insert(items).values({ listId: deRodri.id, tipo: 'exacto', titulo: 'Mate' }).returning()

  // Mamá, como invitada, desde la tablet de Euge: reserva y comenta en la lista de Euge, en el grupo y en la de Rodri
  const mama = await createGuest(db, 'Mamá')
  for (const it of [termo, cafetera, mate]) {
    const r = await reserveItem(db, it.id, { guestId: mama.id })
    if (!r.ok) throw new Error(r.reason)
    await addComment(db, it.id, { guestId: mama.id }, `yo me ocupo de ${it.titulo}`)
  }
  await updateItem(db, termo.id, owner.id, { notas: 'el verde' })
  await updateItem(db, cafetera.id, owner.id, { notas: 'la italiana' })

  // Después Euge entra con Google en esa tablet
  expect(await unirInvitadoACuenta(db, mama.id, owner.id)).toBe(true)

  const deClaim = Object.fromEntries((await db.select().from(claims)).map((c) => [c.itemId, c]))
  expect(deClaim[termo.id]).toMatchObject({ claimerGuestId: mama.id, claimerUserId: null })
  expect(deClaim[cafetera.id]).toMatchObject({ claimerGuestId: mama.id, claimerUserId: null })
  expect(deClaim[mate.id]).toMatchObject({ claimerGuestId: null, claimerUserId: owner.id })
  const deComentario = Object.fromEntries((await db.select().from(comments)).map((c) => [c.itemId, c]))
  expect(deComentario[termo.id].authorGuestId).toBe(mama.id)
  expect(deComentario[cafetera.id].authorGuestId).toBe(mama.id)
  expect(deComentario[mate.id].authorUserId).toBe(owner.id)
  expect((await db.select().from(notifications)).every((n) => n.guestId === mama.id && n.userId === null)).toBe(true)

  // a Euge no le llega ningún cartel sobre sus deseos, y los demás siguen viendo a Mamá
  expect(await getMyClaimWarnings(db, { userId: owner.id })).toEqual([])
  expect(await getUnreadNotifications(db, { userId: owner.id })).toEqual([])
  const detalle = await getItemForViewer(db, 'tok-euge', termo.id, { userId: giver.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba giver')
  expect(detalle.item.claims[0].claimerNombre).toBe('Mamá')
  expect(detalle.comments[0].autorNombre).toBe('Mamá')
})

test('los carteles de reservas y avisos nunca muestran un deseo de una lista propia', async () => {
  const db = await createTestDb()
  const { list, owner } = await seedOwnerAndGiver(db)
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  // un estado que no debería existir (datos viejos), pero por las dudas: una reserva de la dueña en su lista, a punto de vencer
  await db.insert(claims).values({
    itemId: termo.id, claimerUserId: owner.id,
    createdAt: new Date(Date.now() - 10 * 86400_000), expiresAt: new Date(Date.now() + 4 * 86400_000),
  })
  await db.insert(notifications).values({ userId: owner.id, tipo: 'item_editado', itemId: termo.id })
  expect(await getMyClaimWarnings(db, { userId: owner.id })).toEqual([])
  expect(await getUnreadNotifications(db, { userId: owner.id })).toEqual([])
})

test('upsert crea usuario con lista y es idempotente', async () => {
  const db = await createTestDb()
  const u1 = await upsertUserFromGoogle(db, { googleId: 'g-1', email: 'a@test.com', nombre: 'Ana' })
  const u2 = await upsertUserFromGoogle(db, { googleId: 'g-1', email: 'a@test.com', nombre: 'Ana María' })
  expect(u1.id).toBe(u2.id)
  const listas = await db.select().from(lists).where(eq(lists.ownerId, u1.id))
  expect(listas).toHaveLength(1)
  expect(listas[0].shareToken.length).toBeGreaterThanOrEqual(8)
})

test('un usuario sin lista personal la recibe al entrar a Mi lista; uno que no existe no', async () => {
  const db = await createTestDb()
  const [viejo] = await db.insert(users).values({ googleId: 'g-viejo', nombre: 'Viejo', email: 'viejo@test.com' }).returning()
  const lista = await getOwnList(db, viejo.id)
  expect(lista).toMatchObject({ items: [] })
  expect((await db.select().from(lists).where(eq(lists.ownerId, viejo.id)))).toHaveLength(1)
  // la segunda vez es la misma
  expect((await asegurarListaPropia(db, viejo.id))?.shareToken).toBe(lista!.shareToken)
  expect(await getOwnList(db, '8a1f3c2e-0000-4000-8000-000000000000')).toBeNull()
})
