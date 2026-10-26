import { expect, test } from 'vitest'
import { createTestDb } from './helpers'
import { upsertUserFromGoogle } from '@/lib/users'
import { cambiarNombre, yo } from '@/lib/perfil'
import { personas } from '@/lib/amigos'

const entrar = (db: Awaited<ReturnType<typeof createTestDb>>, nombre: string) =>
  upsertUserFromGoogle(db, { googleId: 'g-rodri', email: 'rodri@test.com', nombre })

test('el nombre de Google se pone al día al entrar, hasta que elige uno en Perfil', async () => {
  const db = await createTestDb()
  const u = await entrar(db, 'Rodrigo Mateus')
  expect((await yo(db, u.id)).nombre).toBe('Rodrigo Mateus')
  await entrar(db, 'Rodrigo M.')
  expect((await yo(db, u.id)).nombre).toBe('Rodrigo M.')

  expect(await cambiarNombre(db, u.id, '  Rorro   Mateus ')).toEqual({ ok: true, nombre: 'Rorro Mateus' })
  // lo ven los demás
  expect((await personas(db, [u.id]))[0].nombre).toBe('Rorro Mateus')
  // entrar de nuevo con Google no lo pisa
  const otra = await entrar(db, 'Rodrigo Mateus')
  expect(otra.nombre).toBe('Rorro Mateus')
  expect((await yo(db, u.id)).nombre).toBe('Rorro Mateus')
})

test('un nombre vacío o muy largo, no', async () => {
  const db = await createTestDb()
  const u = await entrar(db, 'Rodri')
  expect(await cambiarNombre(db, u.id, '   ')).toEqual({ ok: false, error: 'vacio' })
  expect(await cambiarNombre(db, u.id, 7)).toEqual({ ok: false, error: 'vacio' })
  expect(await cambiarNombre(db, u.id, 'x'.repeat(61))).toEqual({ ok: false, error: 'largo' })
  expect((await yo(db, u.id)).nombre).toBe('Rodri')
})
