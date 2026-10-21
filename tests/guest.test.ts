import { expect, test, vi } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, codazos, comments, guestIdentities, items, listFollows, lists, notifications, users } from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { getMyClaimWarnings, markBought, releaseClaim, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { createGuest, unirInvitadoACuenta, validarNombre, viewerDeCookie } from '@/lib/guest'
import { firmarInvitado, leerCuentas, leerInvitado, sumarCuenta } from '@/lib/cookie-invitado'
import { getUnreadNotifications, markNotificationsRead } from '@/lib/notifications'
import { asegurarListaPropia, upsertUserFromGoogle } from '@/lib/users'
import { cambiarLinkParaRegalar, getItemForViewer, getListForViewer, getOwnList } from '@/lib/lists'
import { crearGrupo, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
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

test('la cookie de las cuentas que entraron en el navegador vale solo firmada y viaja con el que mira sin sesión', async () => {
  const db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(db)
  const abuela = await createGuest(db, 'Abuela')
  const cuentas = sumarCuenta(sumarCuenta(sumarCuenta(undefined, owner.id), giver.id), owner.id)
  // sin repetir, la última al final
  expect(leerCuentas(cuentas)).toEqual([giver.id, owner.id])
  expect(await viewerDeCookie(db, firmarInvitado(abuela.id), cuentas)).toEqual({ guestId: abuela.id, cuentas: [giver.id, owner.id] })
  // sin invitado también: en las listas de esas cuentas ni se pregunta el nombre
  expect(await viewerDeCookie(db, undefined, cuentas)).toEqual({ cuentas: [giver.id, owner.id] })
  // tocada a mano, sin firma o basura: ninguna
  for (const mal of [cuentas.replace(owner.id, abuela.id), owner.id, `${owner.id}.`, 'xxx', '']) {
    expect(leerCuentas(mal)).toEqual([])
  }
  // guarda las 20 más recientes
  let muchas: string | undefined
  for (let i = 0; i < 25; i++) muchas = sumarCuenta(muchas, `8a1f3c2e-0000-4000-8000-${String(i).padStart(12, '0')}`)
  expect(leerCuentas(muchas)).toHaveLength(20)
  expect(leerCuentas(muchas).at(-1)).toBe('8a1f3c2e-0000-4000-8000-000000000024')
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

test('al confirmar que es el invitado de ese navegador, la cuenta hereda sus reservas, comentarios, avisos y codazos', async () => {
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
  expect(await markBought(db, r.claimId, { userId: user.id })).toEqual({ ok: true })
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

test('lo que el invitado hizo en listas de la cuenta (propia o de un grupo) queda a su nombre, lo reservado se libera y no le llega nada', async () => {
  const db = await createTestDb()
  const { list, owner, giver } = await seedOwnerAndGiver(db)
  // Euge también arma un grupo
  const grupoId = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const cafetera = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Cafetera' }, grupoId))!
  const [deRodri] = await db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  const [mate] = await db.insert(items).values({ listId: deRodri.id, tipo: 'exacto', titulo: 'Mate' }).returning()

  // Euge, sin su sesión (el navegador de WhatsApp), se anotó como invitada: reservó y comentó en la lista de Rodri,
  // pero también en la suya y en la del grupo (las abrió y dijo su nombre en vez de entrar con Google)
  const invitada = await createGuest(db, 'Euge')
  for (const it of [termo, cafetera, mate]) {
    const r = await reserveItem(db, it.id, { guestId: invitada.id })
    if (!r.ok) throw new Error(r.reason)
    await addComment(db, it.id, { guestId: invitada.id }, `yo me ocupo de ${it.titulo}`)
  }
  // la Cafetera hasta la marcó comprada
  await db.update(claims).set({ estado: 'comprado' }).where(eq(claims.itemId, cafetera.id))
  await updateItem(db, termo.id, owner.id, { notas: 'el verde' })
  await updateItem(db, cafetera.id, owner.id, { notas: 'la italiana' })

  // Después entra con Google en ese navegador y dice que es ella
  expect(await unirInvitadoACuenta(db, invitada.id, owner.id)).toBe(true)

  // Lo reservado en sus listas se libera: unida y sin cookie, nadie más lo podría liberar y les trabaría el deseo a los
  // demás. Lo comprado queda como está.
  const deClaim = Object.fromEntries((await db.select().from(claims)).map((c) => [c.itemId, c]))
  expect(deClaim[termo.id]).toMatchObject({ claimerGuestId: invitada.id, claimerUserId: null, estado: 'liberado' })
  expect(deClaim[cafetera.id]).toMatchObject({ claimerGuestId: invitada.id, claimerUserId: null, estado: 'comprado' })
  expect(deClaim[mate.id]).toMatchObject({ claimerGuestId: null, claimerUserId: owner.id, estado: 'reservado' })
  const deComentario = Object.fromEntries((await db.select().from(comments)).map((c) => [c.itemId, c]))
  expect(deComentario[termo.id].authorGuestId).toBe(invitada.id)
  expect(deComentario[cafetera.id].authorGuestId).toBe(invitada.id)
  expect(deComentario[mate.id].authorUserId).toBe(owner.id)
  expect((await db.select().from(notifications)).every((n) => n.guestId === invitada.id && n.userId === null)).toBe(true)

  // con su cuenta no le llega ningún cartel sobre sus deseos (ni la sigue: es suya)
  expect(await getMyClaimWarnings(db, { userId: owner.id })).toEqual([])
  expect(await getUnreadNotifications(db, { userId: owner.id })).toEqual([])
  expect((await db.select().from(listFollows)).map((f) => f.listId)).toEqual([deRodri.id])
  const detalle = await getItemForViewer(db, 'tok-euge', termo.id, { userId: giver.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba giver')
  expect(detalle.item.disponible).toBe(true)
  expect(detalle.comments[0].autorNombre).toBe('Euge')
  // y la dueña ve su lista igual que antes de unir
  expect((await getListForViewer(db, 'tok-euge', { userId: owner.id }))?.role).toBe('owner')
})

test('al unirse, la cuenta sigue las listas donde reservaba como invitado (aparecen en Tu gente y en Eventos)', async () => {
  const db = await createTestDb()
  const { list, owner, giver } = await seedOwnerAndGiver(db)
  const [deMarta] = await db.insert(users).values({ googleId: 'g-marta', nombre: 'Marta', email: 'marta@test.com' }).returning()
  const [listaMarta] = await db.insert(lists).values({ ownerId: deMarta.id, shareToken: 'tok-marta' }).returning()
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const [mate] = await db.insert(items).values({ listId: listaMarta.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  const [taza] = await db.insert(items).values({ listId: listaMarta.id, tipo: 'exacto', titulo: 'Taza' }).returning()
  const abuela = await createGuest(db, 'Abuela')
  for (const it of [termo, mate, taza]) await reserveItem(db, it.id, { guestId: abuela.id })
  // ya seguía la de Euge: no se duplica
  await db.insert(listFollows).values({ userId: giver.id, listId: list.id })

  expect(await unirInvitadoACuenta(db, abuela.id, giver.id)).toBe(true)
  const seguidas = (await db.select().from(listFollows).where(eq(listFollows.userId, giver.id))).map((f) => f.listId)
  expect(seguidas.sort()).toEqual([list.id, listaMarta.id].sort())
  expect(await db.select().from(listFollows).where(eq(listFollows.userId, owner.id))).toEqual([])
})

test('al unirse, lo que el invitado hizo en un grupo del que la cuenta salió queda a nombre del invitado, y lo reservado se libera', async () => {
  const db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(db)
  const grupoId = await crearGrupo(db, owner.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const mate = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Mate' }, grupoId))!
  // Rodri reservó el mate como invitado en la compu; con su cuenta se sumó al grupo y después salió
  const enLaCompu = await createGuest(db, 'Rodri')
  expect(await reserveItem(db, mate.id, { guestId: enLaCompu.id })).toMatchObject({ ok: true })
  await unirseAGrupo(db, grupo.inviteToken!, giver.id)
  expect(await salirDeGrupo(db, grupoId, giver.id)).toBe(true)

  expect(await unirInvitadoACuenta(db, enLaCompu.id, giver.id)).toBe(true)
  // sigue siendo un deseo que armó: no se queda con la reserva (ni la sigue), y el mate queda libre para otro
  const [reserva] = await db.select().from(claims).where(eq(claims.itemId, mate.id))
  expect(reserva).toMatchObject({ estado: 'liberado', claimerGuestId: enLaCompu.id, claimerUserId: null })
  expect(await db.select().from(listFollows).where(eq(listFollows.userId, giver.id))).toEqual([])
})

test('al unirse, no sigue una lista que cambió el link para regalar después de que reservó', async () => {
  const db = await createTestDb()
  const { list, owner, giver } = await seedOwnerAndGiver(db)
  const [sofi] = await db.insert(users).values({ googleId: 'g-sofi', nombre: 'Sofi', email: 'sofi@test.com' }).returning()
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const [mate] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  // Rodri reservó el termo como invitado con el link de antes; Euge lo cambió para sacárselo
  const rodri = await createGuest(db, 'Rodri')
  await reserveItem(db, termo.id, { guestId: rodri.id })
  expect(await cambiarLinkParaRegalar(db, list.id, owner.id)).toBeTruthy()
  // Sofi reservó el mate con el link nuevo
  const enLaCompu = await createGuest(db, 'Sofi')
  await reserveItem(db, mate.id, { guestId: enLaCompu.id })

  expect(await unirInvitadoACuenta(db, rodri.id, giver.id)).toBe(true)
  expect(await unirInvitadoACuenta(db, enLaCompu.id, sofi.id)).toBe(true)
  // la reserva de Rodri pasa a su cuenta (las reservas quedan), pero Tu gente y Eventos no le dan el link nuevo
  expect(await db.select({ claimerUserId: claims.claimerUserId }).from(claims).where(eq(claims.itemId, termo.id))).toEqual([{ claimerUserId: giver.id }])
  expect(await db.select().from(listFollows).where(eq(listFollows.userId, giver.id))).toEqual([])
  expect((await db.select().from(listFollows).where(eq(listFollows.userId, sofi.id))).map((f) => f.listId)).toEqual([list.id])
})

test('al unirse, queda una sola reserva activa por persona y por deseo', async () => {
  const db = await createTestDb()
  const { list, giver } = await seedOwnerAndGiver(db)
  const [velas] = await db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', cantidad: 2 }).returning()
  const [mate] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate', cantidad: 2 }).returning()
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const rodri = { userId: giver.id }
  const enLaCompu = await createGuest(db, 'Rodri')
  // Rodri reservó las Velas con su cuenta en el celular y como invitado en la compu; el Mate lo compró como invitado
  // y además lo tiene reservado con la cuenta; el Termo, solo como invitado
  for (const it of [velas, mate]) await reserveItem(db, it.id, rodri)
  for (const it of [velas, mate, termo]) await reserveItem(db, it.id, { guestId: enLaCompu.id })
  await db.update(claims).set({ estado: 'comprado' }).where(and(eq(claims.itemId, mate.id), eq(claims.claimerGuestId, enLaCompu.id)))

  expect(await unirInvitadoACuenta(db, enLaCompu.id, giver.id)).toBe(true)
  const activas = (itemId: string) => db.select().from(claims)
    .where(and(eq(claims.itemId, itemId), inArray(claims.estado, ['reservado', 'comprado'])))
  // la reservada del invitado se libera: queda una de Rodri y otra vela para otro regalador
  expect(await activas(velas.id)).toEqual([expect.objectContaining({ claimerUserId: giver.id, estado: 'reservado' })])
  // la compra es de verdad: sigue contando, a nombre del invitado
  expect((await activas(mate.id)).map((c) => [c.claimerUserId, c.claimerGuestId, c.estado]).sort()).toEqual([
    [giver.id, null, 'reservado'], [null, enLaCompu.id, 'comprado'],
  ].sort())
  expect(await activas(termo.id)).toEqual([expect.objectContaining({ claimerUserId: giver.id, claimerGuestId: null })])
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

test('en un navegador donde entró la dueña, los carteles del invitado no muestran sus deseos', async () => {
  const db = await createTestDb()
  const { list, owner, giver } = await seedOwnerAndGiver(db)
  const [deRodri] = await db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  const [termo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const [mate] = await db.insert(items).values({ listId: deRodri.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  // Mamá, invitada en la tablet, reservó en las dos listas hace 10 días y las dos se editaron
  const mama = await createGuest(db, 'Mamá')
  for (const it of [termo, mate]) {
    await db.insert(claims).values({
      itemId: it.id, claimerGuestId: mama.id,
      createdAt: new Date(Date.now() - 10 * 86400_000), expiresAt: new Date(Date.now() + 4 * 86400_000),
    })
    await db.insert(notifications).values({ guestId: mama.id, tipo: 'item_editado', itemId: it.id })
  }
  expect((await getMyClaimWarnings(db, { guestId: mama.id })).map((w) => w.itemTitulo).sort()).toEqual(['Mate', 'Termo'])

  // Euge entró con su cuenta en la tablet y después cerró sesión: "¿Conseguiste el Termo?" le contaría todo
  const enLaTablet = { guestId: mama.id, cuentas: [owner.id] }
  expect((await getMyClaimWarnings(db, enLaTablet)).map((w) => w.itemTitulo)).toEqual(['Mate'])
  expect((await getUnreadNotifications(db, enLaTablet)).map((n) => n.itemTitulo)).toEqual(['Mate'])
  // "Marcar como leídas" marca solo lo que se mostró
  await markNotificationsRead(db, enLaTablet)
  expect((await getUnreadNotifications(db, { guestId: mama.id })).map((n) => n.itemTitulo)).toEqual(['Termo'])
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
