import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { guardarGustos, gustosDeLista, misGustos, necesitaBienvenida, saltearBienvenida } from '@/lib/bienvenida'
import { GUSTOS_VACIOS, NO_FUTBOL, SOLO_SELECCION, gustosDesdeForm, sanitizarGustos, seccionesDeGustos } from '@/lib/gustos'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

test('sanitizar: solo valores del catálogo, sin repetidos, y textos cortos', () => {
  const g = sanitizarGustos({
    deportes: ['Pádel', 'Pádel', 'Quidditch', 3],
    club: '  Club   Atlético   Ituzaingó de la Loma y alrededores muy largo  ',
    hobbies: 'Leer',
    marcas: ['Nike', 'Gucci'],
    marcasOtras: 'Gucci, Prada,  , Balenciaga, Otra más',
    colores: ['Verde', 'Fucsia'],
    talles: { remera: 'M', pantalon: '99', calzado: '40' },
    nota: '   Alérgica   a la lana  ',
    hackeo: '<script>',
  })
  expect(g.deportes).toEqual(['Pádel'])
  expect(g.club).toBe('Club Atlético Ituzaingó de la Loma y alr')
  expect(g.hobbies).toEqual(['Leer'])
  expect(g.marcas).toEqual(['Nike', 'Gucci', 'Prada', 'Balenciaga'])
  expect(g.colores).toEqual(['Verde'])
  expect(g.talles).toEqual({ remera: 'M', pantalon: null, calzado: '40' })
  expect(g.nota).toBe('Alérgica a la lana')
  expect(Object.keys(g).sort()).toEqual(Object.keys(GUSTOS_VACIOS).sort())
  expect(sanitizarGustos({})).toEqual(GUSTOS_VACIOS)
})

test('el formulario de la bienvenida se lee completo (club "Otro" incluido)', () => {
  const fd = new FormData()
  for (const d of ['Fútbol', 'Running']) fd.append('deportes', d)
  fd.append('club', 'otro'); fd.append('clubOtro', 'Excursionistas')
  fd.append('mascotas', 'Perro'); fd.append('estilos', 'Urbano'); fd.append('bebidas', 'Mate')
  fd.append('remera', 'L'); fd.append('pantalon', ''); fd.append('calzado', '42')
  fd.append('noRegalar', 'Perfumes'); fd.append('nota', 'ya tengo mil tazas')
  expect(gustosDesdeForm(fd)).toMatchObject({
    deportes: ['Fútbol', 'Running'], club: 'Excursionistas', mascotas: ['Perro'], estilos: ['Urbano'], bebidas: ['Mate'],
    talles: { remera: 'L', pantalon: null, calzado: '42' }, noRegalar: ['Perfumes'], nota: 'ya tengo mil tazas',
  })
  const conClub = new FormData(); conClub.append('club', 'River Plate'); conClub.append('clubOtro', 'ignorado')
  expect(gustosDesdeForm(conClub).club).toBe('River Plate')
})

test('la bienvenida se muestra una sola vez: al completarla o al dejarla para más tarde', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  const rodri = await usuario(db, 'Rodri')
  expect(await necesitaBienvenida(db, euge.id)).toBe(true)
  await guardarGustos(db, euge.id, sanitizarGustos({ deportes: ['Pádel'], club: 'River Plate' }))
  expect(await necesitaBienvenida(db, euge.id)).toBe(false)
  expect(await misGustos(db, euge.id)).toMatchObject({ deportes: ['Pádel'], club: 'River Plate' })

  await saltearBienvenida(db, rodri.id)
  expect(await necesitaBienvenida(db, rodri.id)).toBe(false)
  expect(await misGustos(db, rodri.id)).toBeNull()
  // volver a loguearse no la resetea
  await usuario(db, 'Euge')
  expect(await necesitaBienvenida(db, euge.id)).toBe(false)
})

test('quien regala ve los gustos de cada dueño que los cargó', async () => {
  const db = await createTestDb()
  const [euge, martin, delfina] = [await usuario(db, 'Euge Mateus'), await usuario(db, 'Martín'), await usuario(db, 'Delfina')]
  await guardarGustos(db, euge.id, sanitizarGustos({ club: NO_FUTBOL, hobbies: ['Leer'], mascotas: ['No tengo'], talles: { remera: 'S' } }))
  const [personal] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  expect(await gustosDeLista(db, personal.id)).toEqual([{
    nombre: 'Euge Mateus',
    secciones: [
      { titulo: 'No le interesa', items: ['El fútbol'] },
      { titulo: 'Hobbies y planes', items: ['Leer'] },
      { titulo: 'Talles', items: ['Remera S'] },
    ],
  }])

  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  expect(await gustosDeLista(db, grupoId)).toEqual([]) // nadie cargó nada todavía
  await guardarGustos(db, martin.id, sanitizarGustos({ club: SOLO_SELECCION }))
  expect(await gustosDeLista(db, grupoId)).toEqual([{ nombre: 'Martín', secciones: [{ titulo: 'Hincha de', items: ['La Selección'] }] }])
})

test('en tu perfil los títulos hablan de vos', () => {
  const g = sanitizarGustos({ club: NO_FUTBOL, noRegalar: ['Perfumes'] })
  expect(seccionesDeGustos(g, true).map((s) => s.titulo)).toEqual(['No me interesa', 'No me regalen'])
  expect(seccionesDeGustos(g).map((s) => s.titulo)).toEqual(['No le interesa', 'No le regales'])
  expect(seccionesDeGustos(null)).toEqual([])
})
