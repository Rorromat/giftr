import { describe, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver, seguir } from './helpers'
import { items } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { precioTraido, type RespuestaLink } from '@/lib/completar-deseo'
import { deseoDesdeForm, paraAgregar } from '@/lib/deseo-form'
import { createItem, updateItem } from '@/lib/items'
import { getListForViewer, getOwnList } from '@/lib/lists'
import { getUnreadNotifications } from '@/lib/notifications'
import { leerPrecio, parseDolares, parsePesos } from '@/lib/pesos'
import { antiguedadDelPrecio, partirPorTope, presupuestoDeLista, topeDeLaUrl, topeRedondo, type ConPrecio } from '@/lib/presupuesto'
import { precioParaElForm } from '@/lib/producto-del-link'

// El precio de un deseo en número, al lado del texto que escribió la persona: cómo se lee, cuándo se guarda (con su
// fecha) y cómo se filtra "hasta $X" con eso.

const ars = (min: number, max: number | null = null) => ({ min, max, moneda: 'ARS' })
const usd = (min: number, max: number | null = null) => ({ min, max, moneda: 'USD' })

describe('leerPrecio', () => {
  test.each([
    ['$ 120.000', ars(120_000)],
    ['$45.000', ars(45_000)],
    ['45000', ars(45_000)],
    ['120 mil', ars(120_000)],
    ['45k', ars(45_000)],
    ['15 lucas', ars(15_000)],
    ['1,5 millones', ars(1_500_000)],
    ['$1.500,50', ars(1501)],
    ['desde $20.000', ars(20_000)],
    ['Talle 42 - 30.000', ars(30_000)],
  ])('pesos: %s', (texto, esperado) => {
    expect(leerPrecio(texto)).toEqual(esperado)
  })

  test.each([
    ['US$ 100', usd(100)],
    ['u$s 100', usd(100)],
    ['USD 100', usd(100)],
    ['USD100', usd(100)],
    ['100 dólares', usd(100)],
    ['US$ 1.200', usd(1200)],
    // lo que trae la lectura del link, con centavos: redondeado
    ['US$ 79,99', usd(80)],
    ['US$ 1.234,56', usd(1235)],
    ['US$ 100 a 150', usd(100, 150)],
    ['US$ 1.200 a US$ 1.500', usd(1200, 1500)],
  ])('dólares: %s', (texto, esperado) => {
    expect(leerPrecio(texto)).toEqual(esperado)
  })

  test.each([
    ['$20.000 a $40.000', ars(20_000, 40_000)],
    ['$ 20.000 a $ 40.000', ars(20_000, 40_000)],
    ['$ 20.000 - $ 40.000 aprox', ars(20_000, 40_000)],
    ['$10–30k', ars(10_000, 30_000)],
    ['$20-30.000', ars(20_000, 30_000)],
    ['entre 10 y 30 mil', ars(10_000, 30_000)],
    ['10 mil a 30 mil', ars(10_000, 30_000)],
  ])('un rango, con piso y techo: %s', (texto, esperado) => {
    expect(leerPrecio(texto)).toEqual(esperado)
  })

  test('lo que sigue al precio no es un techo si no es un número pegado, o si es más chico', () => {
    expect(leerPrecio('$45.000 - talle 42')).toEqual(ars(45_000))
    expect(leerPrecio('$45.000 - 2 unidades')).toEqual(ars(45_000))
  })

  test.each([
    [''], [null], [undefined], ['a consultar'], ['gratis'], ['$0'], ['-$5.000'],
    // otra moneda: no se compara con pesos ni con dólares
    ['€ 50'], ['R$ 200'],
    // en cuotas no se sabe si es el total
    ['3 cuotas de $15.000'],
    // pesos y dólares juntos: no se sabe cuál número es de cuál
    ['$120.000 o US$ 100'],
    // no entra en la columna, y no es el precio de un regalo
    ['$3.000.000.000'],
    ['x'.repeat(200)],
  ])('sin número (no es un error): %s', (texto) => {
    expect(leerPrecio(texto)).toBeNull()
  })

  test('lo de siempre no cambió: parsePesos da el piso y parseDolares el número en dólares', () => {
    expect(parsePesos('$20.000 a $40.000')).toBe(20_000)
    expect(parsePesos('$10–30k')).toBe(10_000)
    expect(parsePesos('US$ 100')).toBeNull()
    expect(parseDolares('US$ 1.200')).toBe(1200)
  })

  test('el precio que trae la lectura del link (la API de MercadoLibre o la página) se lee igual', () => {
    expect(leerPrecio(precioParaElForm(88_990, 'ARS', 'www.mercadolibre.com.ar'))).toEqual(ars(88_990))
    expect(leerPrecio(precioParaElForm(79.99, 'USD', 'www.amazon.com'))).toEqual(usd(80))
    expect(leerPrecio(precioParaElForm(1299, 'USD', 'www.amazon.com'))).toEqual(usd(1299))
  })
})

async function setup() {
  const db = await createTestDb()
  const seed = await seedOwnerAndGiver(db)
  const fila = async (id: string) => (await db.select().from(items).where(eq(items.id, id)))[0]
  /** Como si el precio se hubiera cargado hace tantos días. */
  const envejecer = (id: string, dias: number) =>
    db.update(items).set({ precioAt: new Date(Date.now() - dias * 24 * 60 * 60 * 1000) }).where(eq(items.id, id))
  return { db, ...seed, fila, envejecer }
}

describe('al guardar', () => {
  test('el texto queda como lo escribió, con su número, su moneda y la fecha de hoy', async () => {
    const { db, owner, fila } = await setup()
    const antes = Date.now()
    const mate = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Mate', precio: '$ 30.000 aprox' }))!
    expect(mate).toMatchObject({ precio: '$ 30.000 aprox', precioMin: 30_000, precioMax: null, precioMoneda: 'ARS' })
    expect(mate.precioAt!.getTime()).toBeGreaterThanOrEqual(antes - 1000)

    const auris = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Auriculares', precio: 'u$s 100' }))!
    expect(await fila(auris.id)).toMatchObject({ precio: 'u$s 100', precioMin: 100, precioMax: null, precioMoneda: 'USD' })

    // una idea de antes, con su rango: piso y techo
    const libro = (await createItem(db, owner.id, { tipo: 'idea', titulo: 'Un libro', rangoPrecio: '$20.000 a $40.000' }))!
    expect(await fila(libro.id)).toMatchObject({ precioMin: 20_000, precioMax: 40_000, precioMoneda: 'ARS' })
  })

  test('un precio que no se puede leer se guarda igual, sin número; sin precio, tampoco hay fecha', async () => {
    const { db, owner, fila } = await setup()
    const viaje = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Viaje', precio: 'a consultar' }))!
    expect(await fila(viaje.id)).toMatchObject({ precio: 'a consultar', precioMin: null, precioMax: null, precioMoneda: null })
    expect((await fila(viaje.id)).precioAt).not.toBeNull()

    const abrazo = (await createItem(db, owner.id, { tipo: 'idea', titulo: 'Un abrazo' }))!
    expect(await fila(abrazo.id)).toMatchObject({ precio: null, precioMin: null, precioMoneda: null, precioAt: null })
  })

  test('al editar: cambiar el precio cambia el número y la fecha; cambiar otra cosa, no', async () => {
    const { db, owner, fila, envejecer } = await setup()
    const mate = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Mate', precio: '$30.000' }))!
    await envejecer(mate.id, 120)
    const vieja = (await fila(mate.id)).precioAt!

    // las notas no hacen que el precio parezca de hoy
    await updateItem(db, mate.id, owner.id, { notas: 'el de calabaza' })
    expect(await fila(mate.id)).toMatchObject({ precioMin: 30_000, precioAt: vieja })

    await updateItem(db, mate.id, owner.id, { precio: '$45.000 a $60.000' })
    const editado = await fila(mate.id)
    expect(editado).toMatchObject({ precio: '$45.000 a $60.000', precioMin: 45_000, precioMax: 60_000, precioMoneda: 'ARS' })
    expect(editado.precioAt!.getTime()).toBeGreaterThan(vieja.getTime())

    // a algo que no se lee: sin número, con fecha
    await updateItem(db, mate.id, owner.id, { precio: 'preguntar en el local' })
    expect(await fila(mate.id)).toMatchObject({ precioMin: null, precioMax: null, precioMoneda: null })
    // y sin precio: nada
    await updateItem(db, mate.id, owner.id, { precio: null })
    expect(await fila(mate.id)).toMatchObject({ precio: null, precioMin: null, precioAt: null })
  })

  test('"Sigue costando lo mismo": la fecha pasa a hoy sin tocar el texto, y a quien lo reservó no le llega nada', async () => {
    const { db, owner, giver, list, fila, envejecer } = await setup()
    const mate = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Mate', precio: '$30.000' }))!
    await seguir(db, giver.id, list.id)
    expect(await reserveItem(db, mate.id, { userId: giver.id })).toMatchObject({ ok: true })
    await envejecer(mate.id, 120)
    const vieja = (await fila(mate.id)).precioAt!

    expect(await updateItem(db, mate.id, owner.id, { precio: '$30.000', precioVisto: true })).toBe(true)
    const visto = await fila(mate.id)
    expect(visto).toMatchObject({ precio: '$30.000', precioMin: 30_000, precioMoneda: 'ARS' })
    expect(visto.precioAt!.getTime()).toBeGreaterThan(vieja.getTime())
    // no cambió nada de lo que hay que comprar
    expect(await getUnreadNotifications(db, { userId: giver.id })).toEqual([])

    // sin precio no hay nada que confirmar
    const abrazo = (await createItem(db, owner.id, { tipo: 'idea', titulo: 'Un abrazo' }))!
    await updateItem(db, abrazo.id, owner.id, { precioVisto: true })
    expect((await fila(abrazo.id)).precioAt).toBeNull()
  })

  test('el formulario: precioVisto llega solo al editar y con el casillero tildado', () => {
    const fd = (campos: Record<string, string>) => {
      const f = new FormData()
      for (const [k, v] of Object.entries(campos)) f.set(k, v)
      return f
    }
    expect(deseoDesdeForm(fd({ titulo: 'Mate', precio: '30000', precioVisto: '1' }))).toMatchObject({ precio: '$30.000', precioVisto: true })
    expect(deseoDesdeForm(fd({ titulo: 'Mate', precio: '30000' }))!.precioVisto).toBeUndefined()
    // al agregar no va (un pedido armado a mano): a createItem no le llega nada de más
    expect(paraAgregar(deseoDesdeForm(fd({ titulo: 'Mate', precioVisto: '1' }), true)!)).not.toHaveProperty('precioVisto')
  })

  test('las vistas llevan el número: la del dueño y la de quien regala', async () => {
    const { db, owner, giver, list } = await setup()
    await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Mate', precio: '$30.000' })
    await seguir(db, giver.id, list.id)
    expect((await getOwnList(db, owner.id))!.items[0]).toMatchObject({ precioMin: 30_000, precioMoneda: 'ARS' })
    const vista = await getListForViewer(db, 'tok-euge', { userId: giver.id })
    expect(vista!.items[0]).toMatchObject({ precioMin: 30_000, precioMax: null, precioMoneda: 'ARS' })
  })

  test('un deseo de antes que quedó sin número (el relleno no lo entendía) se lee al mostrarlo', async () => {
    const { db, owner, list } = await setup()
    await db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Zapatillas', rangoPrecio: '$80–120k' })
    expect((await getOwnList(db, owner.id))!.items[0]).toMatchObject({ precioMin: 80_000, precioMax: 120_000, precioMoneda: 'ARS', precioAt: null })
  })
})

describe('traer el precio de la tienda, a mano', () => {
  const ok = (precio: string | null): RespuestaLink => ({ estado: 'ok', titulo: 'Mate', precio, foto: null, sitio: 'tienda.com.ar' })

  test('si cambió, va al campo (aunque lo haya escrito el dueño) y la fecha pasa a hoy', () => {
    expect(precioTraido(ok('$45.000'), '$30.000')).toEqual({ precio: '$45.000', visto: true, aviso: 'Ahora cuesta $45.000. Guardá los cambios.' })
  })

  test('si sigue igual, no toca el campo, pero la fecha pasa a hoy', () => {
    expect(precioTraido(ok('$30.000'), ' $30.000 ')).toEqual({ visto: true, aviso: 'Sigue costando $30.000.' })
  })

  test('una falla no dice nada del producto: el precio queda como está, con su fecha', () => {
    expect(precioTraido(ok(null), '$30.000')).toEqual({ visto: false, aviso: 'Esa página no dice el precio.' })
    expect(precioTraido(null, '$30.000')).toMatchObject({ visto: false, aviso: 'No pudimos abrir esa página.' })
    expect(precioTraido(undefined, '$30.000')).toMatchObject({ visto: false, aviso: 'No pudimos abrir esa página.' })
    expect(precioTraido('muchos', '$30.000')).toMatchObject({ visto: false, aviso: 'Buscaste muchos links. Probá en un rato.' })
    expect(precioTraido({ ...ok('$1'), estado: 'bloqueado', sitio: 'articulo.mercadolibre.com.ar' }, '$30.000'))
      .toEqual({ visto: false, aviso: 'MercadoLibre no deja ver la publicación.' })
    for (const r of [null, undefined, 'muchos' as const]) expect(precioTraido(r, '$30.000')).not.toHaveProperty('precio')
  })
})

describe('hasta cuánto: los topes de una lista', () => {
  const enPesos = (...pisos: number[]): ConPrecio[] => pisos.map((precioMin) => ({ precioMin, precioMoneda: 'ARS' }))
  const enDolares = (...pisos: number[]): ConPrecio[] => pisos.map((precioMin) => ({ precioMin, precioMoneda: 'USD' }))
  const sinPrecio: ConPrecio = { precioMin: null, precioMoneda: null }

  test('números lindos, para arriba', () => {
    expect([18_500, 20_000, 20_001, 34_990, 60_000, 89_000, 100_000, 7, 8, 12].map(topeRedondo))
      .toEqual([20_000, 20_000, 30_000, 50_000, 75_000, 100_000, 100_000, 10, 10, 15])
  })

  test('tres topes sacados de los precios de la lista; el que deja adentro a todos no va', () => {
    expect(presupuestoDeLista(enPesos(12_000, 18_500, 25_000, 34_990, 45_000, 60_000, 89_000, 150_000)))
      .toEqual({ moneda: 'ARS', topes: [20_000, 50_000, 75_000] })
    // los caros están muy lejos: el tope de arriba ya los deja afuera a los dos
    expect(presupuestoDeLista(enPesos(10_000, 10_000, 10_000, 10_000, 500_000, 900_000))).toEqual({ moneda: 'ARS', topes: [10_000, 500_000] })
  })

  test('con 12 o más, cuatro', () => {
    const p = presupuestoDeLista(enPesos(5000, 8000, 12_000, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 70_000, 90_000, 200_000))
    expect(p).toEqual({ moneda: 'ARS', topes: [15_000, 20_000, 50_000, 75_000] })
  })

  test('con menos de 6 deseos con precio no hay filtro; si todos cuestan lo mismo, tampoco', () => {
    expect(presupuestoDeLista([...enPesos(10_000, 20_000, 30_000, 40_000, 50_000), sinPrecio, sinPrecio])).toBeNull()
    expect(presupuestoDeLista(enPesos(10_000, 10_000, 10_000, 10_000, 10_000, 10_000))).toBeNull()
    expect(presupuestoDeLista([])).toBeNull()
  })

  test('monedas mezcladas: se filtra en la que más deseos tiene (pesos si empatan), y la otra no cuenta para los 6', () => {
    const pesos = enPesos(10_000, 20_000, 30_000, 40_000, 50_000, 60_000)
    expect(presupuestoDeLista([...pesos, ...enDolares(100, 200)])?.moneda).toBe('ARS')
    expect(presupuestoDeLista([...pesos, ...enDolares(100, 200)])?.topes).toEqual(presupuestoDeLista(pesos)?.topes)
    // 5 en pesos y 3 en dólares: ninguna llega
    expect(presupuestoDeLista([...enPesos(1, 2, 3, 4, 5), ...enDolares(100, 200, 300)])).toBeNull()
    // una lista en dólares
    expect(presupuestoDeLista([...enDolares(20, 35, 50, 80, 120, 300, 900), ...enPesos(10_000)])).toEqual({ moneda: 'USD', topes: [50, 100, 300] })
    expect(presupuestoDeLista([...enDolares(1, 2, 3, 4, 5, 60), ...enPesos(1, 2, 3, 4, 5, 60)])?.moneda).toBe('ARS')
  })

  test('el tope de la URL: un entero positivo, o nada', () => {
    expect(topeDeLaUrl('50000')).toBe(50_000)
    for (const no of [undefined, '', '0', '-5', '5e4', '50.000', 'abc', '050', '99999999999']) expect(topeDeLaUrl(no)).toBeNull()
  })

  test('qué entra: el piso de un rango cuenta; sin precio o en otra moneda va aparte; lo que se pasa, afuera', () => {
    const d = (titulo: string, precioMin: number | null, precioMoneda: 'ARS' | 'USD' | null = precioMin === null ? null : 'ARS') =>
      ({ titulo, precioMin, precioMoneda })
    const deseos = [
      d('Mate', 30_000), d('Idea de 20 a 80', 20_000), d('Justo', 50_000), d('Termo', 95_000), d('Abrazo', null),
      d('Auriculares en dólares', 100, 'USD'), d('Idea de 60 a 40… al revés', 60_000),
    ]
    const { dentro, sinPrecio: aparte } = partirPorTope(deseos, 50_000, 'ARS')
    expect(dentro.map((x) => x.titulo)).toEqual(['Mate', 'Idea de 20 a 80', 'Justo'])
    // US$ 100 es menos que 50.000, pero no son pesos: no entra por el número
    expect(aparte.map((x) => x.titulo)).toEqual(['Abrazo', 'Auriculares en dólares'])
    // en una lista en dólares es al revés
    expect(partirPorTope(deseos, 150, 'USD')).toMatchObject({ dentro: [{ titulo: 'Auriculares en dólares' }] })
    expect(partirPorTope(deseos, 150, 'USD').sinPrecio).toHaveLength(6)
  })
})

describe('la fecha del precio', () => {
  const hoy = new Date('2026-11-11T12:00:00Z')
  const hace = (dias: number) => new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000)

  test('hasta 60 días no se dice nada; después, hace cuántos meses', () => {
    expect(antiguedadDelPrecio(hace(0), hoy)).toBeNull()
    expect(antiguedadDelPrecio(hace(59), hoy)).toBeNull()
    expect(antiguedadDelPrecio(hace(60), hoy)).toBe('hace 2 meses')
    expect(antiguedadDelPrecio(hace(100), hoy)).toBe('hace 3 meses')
    expect(antiguedadDelPrecio(hace(125), hoy)).toBe('hace 4 meses')
    expect(antiguedadDelPrecio(hace(364), hoy)).toBe('hace 12 meses')
    expect(antiguedadDelPrecio(hace(365), hoy)).toBe('hace más de un año')
    expect(antiguedadDelPrecio(hace(2000), hoy)).toBe('hace más de un año')
  })

  test('sin fecha (un deseo sin precio) no se dice nada', () => {
    expect(antiguedadDelPrecio(null, hoy)).toBeNull()
    expect(antiguedadDelPrecio(undefined, hoy)).toBeNull()
  })
})
