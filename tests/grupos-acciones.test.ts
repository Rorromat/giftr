import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { lists } from '@/db/schema'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo } from '@/lib/groups'

// Las acciones de los grupos y los links tal cual, con la base en PGlite y la sesión y las redirecciones de Next simuladas.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import { createGroupAction, newInviteAction, newShareLinkAction, setGroupDateAction } from '@/app/actions'

async function preparar() {
  h.db = await createTestDb()
  const caro = await upsertUserFromGoogle(h.db, { googleId: 'g-caro', email: 'caro@test.com', nombre: 'Caro' })
  h.session = { userId: caro.id }
  return { db: h.db, caro }
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function redirigeA(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return (e as { url: string }).url }
  throw new Error('esperaba una redirección')
}

const grupo = async (db: Db, id: string) => (await db.select().from(lists).where(eq(lists.id, id)))[0]

test('crear un grupo con una fecha que no existe: se crea sin fecha y la pantalla del grupo lo avisa (nunca un 500)', async () => {
  const { db } = await preparar()
  const url = await redirigeA(createGroupAction(form({ nombre: 'Casamiento', fecha: '2026-02-30' })))
  expect(url).toMatch(/^\/grupos\/[0-9a-f-]{36}\?fecha=invalida$/)
  const creado = await grupo(db, url.slice('/grupos/'.length, -'?fecha=invalida'.length))
  expect(creado).toMatchObject({ nombre: 'Casamiento', eventoFecha: null })

  const bien = await redirigeA(createGroupAction(form({ nombre: 'Mudanza', fecha: '2027-03-06' })))
  expect(bien).toMatch(/^\/grupos\/[0-9a-f-]{36}$/)
  expect(await grupo(db, bien.slice('/grupos/'.length))).toMatchObject({ eventoFecha: '2027-03-06', eventoAnual: false })
})

test('cambiar la fecha por una que no existe vuelve con el aviso y deja la que estaba', async () => {
  const { db, caro } = await preparar()
  const id = await crearGrupo(db, caro.id, { nombre: 'Mellizos', eventoFecha: '2020-10-12' })
  expect(await redirigeA(setGroupDateAction(form({ grupoId: id, fecha: '0000-01-01' })))).toBe(`/grupos/${id}?fecha=invalida`)
  expect((await grupo(db, id)).eventoFecha).toBe('2020-10-12')
  // una buena vuelve a la pantalla sin el aviso
  expect(await redirigeA(setGroupDateAction(form({ grupoId: id, fecha: '2026-03-01' })))).toBe(`/grupos/${id}`)
  expect((await grupo(db, id))).toMatchObject({ eventoFecha: '2026-03-01', eventoAnual: false })
  expect(await redirigeA(setGroupDateAction(form({ grupoId: id, quitar: '1' })))).toBe(`/grupos/${id}`)
  expect((await grupo(db, id)).eventoFecha).toBeNull()
})

test('los links nuevos: invitación y para regalar del grupo, y el de la lista personal desde Perfil', async () => {
  const { db, caro } = await preparar()
  const id = await crearGrupo(db, caro.id, { nombre: 'Mellizos' })
  const antes = await grupo(db, id)
  expect(await redirigeA(newInviteAction(form({ grupoId: id })))).toBe(`/grupos/${id}?nuevo=invitacion`)
  expect(await redirigeA(newShareLinkAction(form({ grupoId: id })))).toBe(`/grupos/${id}?nuevo=regalar`)
  const despues = await grupo(db, id)
  expect(despues.inviteToken).not.toBe(antes.inviteToken)
  expect(despues.shareToken).not.toBe(antes.shareToken)

  const [personal] = await db.select().from(lists).where(eq(lists.ownerId, caro.id))
  expect(await redirigeA(newShareLinkAction(form({})))).toBe('/perfil?nuevo=regalar')
  expect((await grupo(db, personal.id)).shareToken).not.toBe(personal.shareToken)

  // de un grupo ajeno no cambia nada ni avisa que cambió
  const otra = await upsertUserFromGoogle(db, { googleId: 'g-otra', email: 'otra@test.com', nombre: 'Otra' })
  h.session = { userId: otra.id }
  await newInviteAction(form({ grupoId: id }))
  await newShareLinkAction(form({ grupoId: id }))
  expect(await grupo(db, id)).toEqual(despues)
})
