import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, grupoParaDueno, unirseAGrupo } from '@/lib/groups'
import { createItem, sumarDeseoSugerido } from '@/lib/items'
import { getListForViewer } from '@/lib/lists'
import { guardarFechaGrupo } from '@/lib/events'
import { listaParaCompartir, textoInvitarAArmar, textoListaEnComun } from '@/lib/compartir'
import { datosDeOcasion, deseoSugerido, esOcasion, OCASIONES, ocasionDeLista, sugerenciasPara, tapaDeOcasion } from '@/lib/ocasiones'
import { paletaDe } from '@/lib/colores-fechas'
import { TAPA_EN_COMUN } from '@/lib/tapas'

// Para qué es una lista en común (ver ocasiones.ts): se elige al crearla, y de ahí salen la tapa, las ideas para empezar y
// lo que se manda por WhatsApp. La fecha sigue siendo la de siempre.

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

const fila = async (db: Db, id: string) => (await db.select().from(lists).where(eq(lists.id, id)))[0]

test('crear una lista en común con cada ocasión: queda guardada, y un cumple es un cumple por las dos puertas', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  for (const ocasion of OCASIONES) {
    const id = await crearGrupo(db, euge.id, { nombre: `Lista de ${ocasion}`, ocasion, eventoFecha: ocasion === 'cumple' ? '2000-10-12' : '2027-03-20', eventoAnual: false })
    const l = await fila(db, id)
    expect({ ocasion: l.ocasion, esCumple: l.esCumple }, ocasion).toEqual({ ocasion, esCumple: ocasion === 'cumple' })
    // el cumple se repite todos los años; el resto, lo que se pidió (un casamiento pasa una vez)
    expect(l.eventoAnual, ocasion).toBe(ocasion === 'cumple')
    expect((await grupoParaDueno(db, id, euge.id))?.ocasion, ocasion).toBe(ocasion)
    // las listas nuevas siguen naciendo con "solo con cuenta se ve quién reservó"
    expect(l.nombresSoloConCuenta).toBe(true)
  }
  // sin decir la ocasión (los que la crean como antes): cumple si es un cumple, si no "otra"
  expect((await fila(db, await crearGrupo(db, euge.id, { nombre: 'Juancito', esCumple: true }))).ocasion).toBe('cumple')
  expect((await fila(db, await crearGrupo(db, euge.id, { nombre: 'Nuestra casa' }))).ocasion).toBe('otra')
  // y una ocasión que no existe (un formulario armado a mano) no se guarda
  expect((await fila(db, await crearGrupo(db, euge.id, { nombre: 'Rara', ocasion: 'divorcio' as never }))).ocasion).toBe('otra')
  expect(esOcasion('casamiento')).toBe(true)
  for (const no of ['divorcio', '', null, undefined, ['casamiento']]) expect(esOcasion(no)).toBe(false)
})

test('la ocasión que se lee: manda "es un cumple" (que se cambia con la fecha), y al dejar de serlo vuelve la que eligió', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  const id = await crearGrupo(db, euge.id, { nombre: 'El casamiento de Euge y Rodri', ocasion: 'casamiento', eventoFecha: '2027-03-20', eventoAnual: false })
  expect(ocasionDeLista(await fila(db, id))).toBe('casamiento')
  // desde la pantalla de la lista le ponen "Es un cumple" a la fecha: ahora es un cumple, para todo
  await guardarFechaGrupo(db, id, euge.id, '2000-10-12', true, undefined, true)
  expect(ocasionDeLista(await fila(db, id))).toBe('cumple')
  expect((await grupoParaDueno(db, id, euge.id))?.ocasion).toBe('cumple')
  // y si vuelve a "Otra cosa", es otra vez el casamiento
  await guardarFechaGrupo(db, id, euge.id, '2027-03-20', false, undefined, false)
  expect(ocasionDeLista(await fila(db, id))).toBe('casamiento')
  // una que nació como cumple y deja de serlo queda como "otra"
  const cumple = await crearGrupo(db, euge.id, { nombre: 'Juancito', ocasion: 'cumple' })
  await guardarFechaGrupo(db, cumple, euge.id, '2027-03-20', false, undefined, false)
  expect(ocasionDeLista(await fila(db, cumple))).toBe('otra')
  // una lista personal no tiene ocasión
  expect(ocasionDeLista({ tipo: 'personal', esCumple: false, ocasion: 'otra' })).toBeNull()
})

test('la migración: las listas en común que ya eran un cumple quedan como cumple, y las demás como "otra"', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  const [cumple, casa] = [await crearGrupo(db, euge.id, { nombre: 'Juancito', esCumple: true }), await crearGrupo(db, euge.id, { nombre: 'Nuestra casa' })]
  // como estaban antes de la columna: todas con el valor por defecto
  await db.update(lists).set({ ocasion: 'otra' })
  const archivo = readdirSync('drizzle').find((f) => f.endsWith('_ocasion_y_aporte_en_plata.sql'))!
  for (const s of readFileSync(`drizzle/${archivo}`, 'utf8').split('--> statement-breakpoint')) if (!/^\s*ALTER TABLE/.test(s)) await db.execute(sql.raw(s))
  expect((await fila(db, cumple)).ocasion).toBe('cumple')
  expect((await fila(db, casa)).ocasion).toBe('otra')
  // la lista personal de Euge no se toca
  const [personal] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  expect(personal.ocasion).toBe('otra')
})

test('cada ocasión tiene su nombre sugerido, su pregunta de la fecha y su tapa (de la paleta que ya hay)', () => {
  expect(datosDeOcasion('casamiento')).toMatchObject({ nombre: 'Casamiento', ejemploDeNombre: 'El casamiento de Euge y Rodri', fecha: { pregunta: '¿Cuándo es el casamiento?', anual: false } })
  expect(datosDeOcasion('baby_shower')).toMatchObject({ nombre: 'Baby shower', ejemploDeNombre: 'La llegada de Olivia', fecha: { pregunta: '¿Cuándo es el baby shower?', anual: false } })
  expect(datosDeOcasion('cumple').fecha).toMatchObject({ pregunta: '¿Cuándo cumple?', anual: true })
  // en "Otra" se sigue preguntando si se repite, como siempre
  expect(datosDeOcasion('otra').fecha.anual).toBeNull()
  // la tapa: frambuesa y verde agua, de la paleta de las fechas; las demás, la de las listas en común
  expect(tapaDeOcasion('casamiento')).toBe(paletaDe('madre').fondo)
  expect(tapaDeOcasion('baby_shower')).toBe(paletaDe('ninos').fondo)
  for (const o of ['cumple', 'casa_nueva', 'otra', null] as const) expect(tapaDeOcasion(o)).toBe(TAPA_EN_COMUN)
  // todas tienen con qué armar el formulario
  for (const o of OCASIONES) {
    const d = datosDeOcasion(o)
    for (const texto of [d.nombre, d.paraQue, d.ejemploDeNombre, d.ayudaDelNombre, d.ejemploDeDescripcion, d.fecha.pregunta]) expect(texto, o).not.toBe('')
  }
})

test('las ideas para empezar son las de la ocasión, sin las que la lista ya tiene', () => {
  const casamiento = sugerenciasPara('casamiento', [])
  expect(casamiento.map((s) => s.titulo)).toEqual(['Luna de miel', 'Vajilla', 'Sábanas', 'Juego de toallas', 'Electrodoméstico', 'Valijas'])
  // la luna de miel es plata; el resto, deseos
  expect(casamiento.filter((s) => s.aporte).map((s) => s.titulo)).toEqual(['Luna de miel'])
  const baby = sugerenciasPara('baby_shower', [])
  expect(baby.map((s) => s.titulo)).toEqual(expect.arrayContaining(['Cochecito', 'Pañales', 'Ropa de 0 a 3 meses', 'Cuna']))
  expect(baby.find((s) => s.titulo === 'Cochecito')?.aporte).toBe(true)
  // los pañales los pueden regalar varios
  expect(baby.find((s) => s.titulo === 'Pañales')?.repetible).toBe(true)
  // las que ya están (sin importar mayúsculas ni espacios) no se vuelven a ofrecer
  expect(sugerenciasPara('casamiento', ['vajilla', ' LUNA DE MIEL ']).map((s) => s.titulo)).toEqual(['Sábanas', 'Juego de toallas', 'Electrodoméstico', 'Valijas'])
  // un cumple, "otra" y una lista personal no traen ideas
  for (const o of ['cumple', 'otra', null] as const) expect(sugerenciasPara(o, [])).toEqual([])
  // solo se reconoce una de las suyas
  expect(deseoSugerido('casamiento', 'vajilla')?.titulo).toBe('Vajilla')
  expect(deseoSugerido('casamiento', 'Pañales')).toBeNull()
  expect(deseoSugerido(null, 'Vajilla')).toBeNull()
})

test('una idea se suma con un toque como un deseo más; nunca sola, ni la de otra ocasión, ni un aporte sin alias', async () => {
  const db = await createTestDb()
  const [euge, rodri, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi')]
  const id = await crearGrupo(db, euge.id, { nombre: 'La llegada de Olivia', ocasion: 'baby_shower' })
  const deLaLista = () => db.select().from(items).where(eq(items.listId, id))
  // recién creada no tiene nada: las ideas no se agregan solas
  expect(await deLaLista()).toEqual([])

  const panales = await sumarDeseoSugerido(db, euge.id, id, 'Pañales')
  expect(panales).toMatchObject({ titulo: 'Pañales', tipo: 'idea', repetible: true, estadoDueno: 'activo' })
  expect(await sumarDeseoSugerido(db, euge.id, id, 'Ropa de 0 a 3 meses')).toMatchObject({ tipo: 'idea', categoria: 'Ropa', repetible: true })
  expect(await sumarDeseoSugerido(db, euge.id, id, 'Cuna')).toMatchObject({ tipo: 'idea', repetible: false })
  // un doble toque (o tocarla de nuevo desde una pantalla vieja) no la duplica
  expect((await sumarDeseoSugerido(db, euge.id, id, 'pañales'))?.id).toBe(panales!.id)
  expect((await deLaLista()).map((i) => i.titulo).sort()).toEqual(['Cuna', 'Pañales', 'Ropa de 0 a 3 meses'])

  // lo que llega es solo el nombre, y tiene que ser de su ocasión: ni la de un casamiento, ni un texto cualquiera
  expect(await sumarDeseoSugerido(db, euge.id, id, 'Vajilla')).toBeNull()
  expect(await sumarDeseoSugerido(db, euge.id, id, '<script>')).toBeNull()
  // el cochecito es un aporte en plata: sin decir a qué alias no se suma (va por su formulario)
  expect(await sumarDeseoSugerido(db, euge.id, id, 'Cochecito')).toBeNull()
  // solo quien la arma: ni otro, ni en la lista personal, ni con ids que no son
  expect(await sumarDeseoSugerido(db, sofi.id, id, 'Bañera')).toBeNull()
  const [personal] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  expect(await sumarDeseoSugerido(db, euge.id, personal.id, 'Bañera')).toBeNull()
  expect(await sumarDeseoSugerido(db, euge.id, 'no-es-un-id', 'Bañera')).toBeNull()
  // el que la arma con ella, sí
  await unirseAGrupo(db, (await fila(db, id)).inviteToken!, rodri.id)
  expect(await sumarDeseoSugerido(db, rodri.id, id, 'Bañera')).toMatchObject({ titulo: 'Bañera' })
  expect((await deLaLista()).length).toBe(4)

  // lo que queda por ofrecer: lo que todavía no está
  const titulos = (await grupoParaDueno(db, id, euge.id))!.items.map((i) => i.titulo)
  expect(sugerenciasPara('baby_shower', titulos).map((s) => s.titulo)).toEqual(['Cochecito', 'Huevito para el auto', 'Mamaderas'])
})

test('lo que se manda por WhatsApp habla de la ocasión, dice qué hacer y que ellos no se enteran', () => {
  const url = 'https://giftr.test/l/tok'
  const casamiento = textoListaEnComun({ nombre: 'El casamiento de Euge y Rodri', ocasion: 'casamiento' }, url)
  expect(casamiento).toBe('¡Nos casamos! 💍 Armamos nuestra lista en GiftR: "El casamiento de Euge y Rodri". Elegí un regalo y reservalo, o aportá para lo que más queremos: nosotros no vemos quién regala qué.\nhttps://giftr.test/l/tok')
  const baby = textoListaEnComun({ nombre: 'La llegada de Olivia', ocasion: 'baby_shower' }, url)
  expect(baby).toContain('¡Se viene el bebé! 🍼')
  expect(baby).toContain('o aportá para lo más grande')
  expect(textoListaEnComun({ nombre: 'Cumple de Juancito', ocasion: 'cumple' }, url)).toContain('Armamos la lista de Juancito para su cumple 🎂')
  expect(textoListaEnComun({ nombre: 'Nuestra casa', ocasion: 'casa_nueva' }, url)).toContain('¡Casa nueva! 🏠 Armamos la lista "Nuestra casa" en GiftR.')
  for (const ocasion of OCASIONES) {
    const t = textoListaEnComun({ nombre: 'La lista', ocasion }, url)
    // el link al final, en su renglón (WhatsApp arma la vista previa), la regla de la sorpresa, y nunca "grupo"
    expect(t.endsWith(`\n${url}`), ocasion).toBe(true)
    expect(t, ocasion).toContain('no vemos quién regala qué')
    expect(t, ocasion).toMatch(/reservalo/)
    expect(t, ocasion).not.toMatch(/grupo/i)
  }
  expect(textoInvitarAArmar({ nombre: 'Nuestra casa' }, 'https://giftr.test/grupos/unirme/inv')).toBe('Armemos juntos la lista "Nuestra casa" en GiftR: https://giftr.test/grupos/unirme/inv')
})

test('quien regala recibe la ocasión con la lista (para su tapa), y la vista previa del link también', async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
  const id = await crearGrupo(db, euge.id, { nombre: 'El casamiento de Euge y Rodri', ocasion: 'casamiento' })
  await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Vajilla' }, id)
  const { shareToken } = await fila(db, id)
  const vista = await getListForViewer(db, shareToken, { userId: sofi.id })
  if (vista?.role !== 'giver') throw new Error('esperaba la vista de quien regala')
  expect(vista.ocasion).toBe('casamiento')
  // sin decir quién es, también (la tapa es la misma para todos)
  const anonima = await getListForViewer(db, shareToken, {})
  if (anonima?.role !== 'anonimo') throw new Error('esperaba la vista sin identificarse')
  expect(anonima.ocasion).toBe('casamiento')
  expect(await listaParaCompartir(db, shareToken)).toMatchObject({ grupoNombre: 'El casamiento de Euge y Rodri', ocasion: 'casamiento', conAportes: false })
  // la lista personal de alguien no tiene ocasión
  const [personal] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const deEuge = await getListForViewer(db, personal.shareToken, { userId: sofi.id })
  if (deEuge?.role !== 'giver') throw new Error('esperaba la vista de quien regala')
  expect(deEuge.ocasion).toBeNull()
})
