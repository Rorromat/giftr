import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { asc, sql } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { items } from '@/db/schema'
import type { Db } from '@/db/types'
import { leerPrecio } from '@/lib/pesos'

// Los deseos cargados antes de que el precio tuviera número: la migración los rellena con SQL para los formatos simples.
// createTestDb ya la corrió sobre una base vacía; acá se arman los deseos como eran (el texto solo) y se vuelve a correr
// el relleno. El número de la migración lo pone el integrador al juntar: se busca por nombre.
async function rellenar(db: Db) {
  const archivo = readdirSync('drizzle').find((f) => f.endsWith('_precio_en_numero.sql'))!
  const sentencias = readFileSync(`drizzle/${archivo}`, 'utf8').split('--> statement-breakpoint')
  // las columnas ya están: solo el relleno
  for (const s of sentencias) if (!/^\s*ALTER TABLE/.test(s)) await db.execute(sql.raw(s))
}

const CREADO = new Date('2026-03-01T15:00:00Z')

async function conDeseosViejos(textos: { precio?: string; rangoPrecio?: string }[]) {
  const db = await createTestDb()
  const { list } = await seedOwnerAndGiver(db)
  // con fechas en orden, para leerlos en el orden en que se cargaron
  await db.insert(items).values(textos.map((t, i) => ({
    listId: list.id, tipo: 'exacto' as const, titulo: `Deseo ${i}`, ...t, createdAt: new Date(CREADO.getTime() + i * 1000),
  })))
  await rellenar(db)
  return db.select().from(items).orderBy(asc(items.createdAt))
}

test('lo que rellena el SQL es lo mismo que lee leerPrecio', async () => {
  const textos = [
    // pesos
    '$45.000', '$ 45.000', '$45000', '45.000', '45000', '$1.250.000', '$ 999', '$1.500,50', '$45000,5', '  $30.000  ',
    // dólares
    'US$ 300', 'us$300', 'U$S 1.200', 'u$d 50', 'USD 79,99', 'USD 1.234,56',
    // rangos en pesos
    '$20.000 a $40.000', '$ 20.000 a $ 40.000', '$20000 - 40000', '20.000-40.000', '$20.000 – $40.000', '$45.000 - 2000',
  ]
  const filas = await conDeseosViejos(textos.map((precio) => ({ precio })))
  for (const [i, texto] of textos.entries()) {
    const leido = leerPrecio(texto)
    // todos estos se leen: si el SQL no los toma, el test lo dice
    expect(leido, texto).not.toBeNull()
    expect({ texto, min: filas[i].precioMin, max: filas[i].precioMax, moneda: filas[i].precioMoneda })
      .toEqual({ texto, min: leido!.min, max: leido!.max, moneda: leido!.moneda })
    // el texto no se toca
    expect(filas[i].precio).toBe(texto)
  }
  expect(filas.find((f) => f.precio === '$20.000 a $40.000')).toMatchObject({ precioMin: 20_000, precioMax: 40_000, precioMoneda: 'ARS' })
  expect(filas.find((f) => f.precio === '$45.000 - 2000')).toMatchObject({ precioMin: 45_000, precioMax: null })
  expect(filas.find((f) => f.precio === 'USD 79,99')).toMatchObject({ precioMin: 80, precioMoneda: 'USD' })
})

test('lo que el SQL no entiende queda sin número (nunca con uno equivocado), y el texto queda igual', async () => {
  const textos = [
    // se leen al mostrarlos (ver pickItemFields), no en el SQL
    '45k', '15 lucas', '$10–30k', '$20-30.000', '120 mil', '$ 45 000', '$45,000', 'aprox $30.000', '100 dólares', 'US$ 100 a 150',
    // y lo que no es un precio que se pueda comparar
    'a consultar', '€ 50', '3 cuotas de $15.000', '$120.000 o US$ 100', '$0', '$045', '$3.000.000.000', '$1.50', '-$5.000', 'R$ 200',
    '$20 - $30.000',
  ]
  const filas = await conDeseosViejos(textos.map((precio) => ({ precio })))
  for (const [i, texto] of textos.entries()) {
    expect({ texto, min: filas[i].precioMin, max: filas[i].precioMax, moneda: filas[i].precioMoneda })
      .toEqual({ texto, min: null, max: null, moneda: null })
    expect(filas[i].precio).toBe(texto)
  }
})

test('una idea de antes lleva el número de su rango; si tiene precio, manda el precio (es lo que se muestra)', async () => {
  const [idea, conLosDos, sinNada] = await conDeseosViejos([
    { rangoPrecio: '$20.000 a $40.000' }, { precio: '$50.000', rangoPrecio: '$20.000 a $40.000' }, {},
  ])
  expect(idea).toMatchObject({ precioMin: 20_000, precioMax: 40_000, precioMoneda: 'ARS' })
  expect(conLosDos).toMatchObject({ precioMin: 50_000, precioMax: null, precioMoneda: 'ARS' })
  expect(sinNada).toMatchObject({ precioMin: null, precioMax: null, precioMoneda: null, precioAt: null })
})

test('la fecha del precio de lo que ya estaba es la del deseo, se haya leído el número o no', async () => {
  const [leido, sinLeer, sinPrecio, vacio] = await conDeseosViejos([{ precio: '$45.000' }, { precio: 'a consultar' }, {}, { precio: '  ' }])
  expect(leido.precioAt).toEqual(leido.createdAt)
  expect(sinLeer.precioAt).toEqual(sinLeer.createdAt)
  expect(sinPrecio.precioAt).toBeNull()
  expect(vacio.precioAt).toBeNull()
})
