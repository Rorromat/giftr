import { expect, test, vi } from 'vitest'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { claims, guestIdentities, items, lists, users } from '@/db/schema'
import { guardarAliasPago, upsertUserFromGoogle } from '@/lib/users'
import { aportar, reserveItem } from '@/lib/claims'
import { crearGrupo, grupoParaDueno, unirseAGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import { misRegalos } from '@/lib/mis-regalos'
import { paletaDe } from '@/lib/colores-fechas'

// El aporte en plata y las ocasiones de una lista en común, en las pantallas tal cual (dibujadas), con la base en PGlite y
// las cookies, la sesión y las redirecciones de Next simuladas: lo que ve quien regala (sin nombre, con su nombre y con
// su cuenta), lo que ven los que arman la lista, y los formularios.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  jar: new Map<string, string>(),
  session: null as { userId: string; user?: { name: string } } | null,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (h.jar.has(k) ? { name: k, value: h.jar.get(k)! } : undefined),
    set: (k: string, v: string) => { h.jar.set(k, v) },
    delete: (k: string) => { h.jar.delete(k) },
  }),
  headers: async () => new Headers(),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  RedirectType: { push: 'push', replace: 'replace' },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/mi-lista',
  useSearchParams: () => new URLSearchParams(),
}))
// los carteles de avisos se arman solos con la base (un componente async): acá no se dibujan
vi.mock('@/components/Banners', () => ({ Banners: () => null }))

import { addItemAction, aportarAction, createGroupAction, deshacerAporteAction, reserveAction, sumarDeseoSugeridoAction, updateItemAction } from '@/app/actions'
import ListaAjena, { generateMetadata as metadataDeLista } from '@/app/l/[token]/page'
import DetalleItem, { generateMetadata as metadataDelDeseo } from '@/app/l/[token]/item/[itemId]/page'
import ListaEnComun from '@/app/(menu)/grupos/[id]/page'
import NuevaLista from '@/app/grupos/nuevo/page'
import Deseo from '@/app/(menu)/deseo/[id]/page'
import Agregar from '@/app/(menu)/agregar/page'
import Editar from '@/app/(menu)/editar/[id]/page'
import { OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { FilaRegalo } from '@/components/FilaRegalo'

const dibujar = async (p: Promise<React.ReactNode>) => renderToStaticMarkup(await p as React.ReactElement)
const texto = (s: string) => s.replace(/<[^>]+>/g, ' ').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replace(/\s+/g, ' ')
const veces = (html: string, t: string) => html.split(t).length - 1
function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}
/** A dónde redirige (null si no redirige). */
async function redirige(p: Promise<unknown>): Promise<string | null> {
  try { await p } catch (e) { return (e as { url?: string }).url ?? null }
  return null
}
const usuario = (nombre: string) => upsertUserFromGoogle(h.db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })

const ALIAS = 'euge.y.rodri'

/**
 * El casamiento de Euge y Rodri (una lista en común): la Luna de miel (un aporte con meta) cargada DESPUÉS de la Vajilla
 * y el Termo, para ver que igual va arriba. Sofi y Caro regalan con su cuenta.
 */
async function casamiento() {
  h.db = await createTestDb()
  h.jar.clear()
  h.session = null
  const [euge, rodri, sofi, caro] = [await usuario('Euge'), await usuario('Rodri'), await usuario('Sofi'), await usuario('Caro')]
  const id = await crearGrupo(h.db, euge.id, { nombre: 'El casamiento de Euge y Rodri', ocasion: 'casamiento', eventoFecha: '2027-03-20', eventoAnual: false })
  const [grupo] = await h.db.select().from(lists).where(eq(lists.id, id))
  await unirseAGrupo(h.db, grupo.inviteToken!, rodri.id)
  const vajilla = (await createItem(h.db, euge.id, { tipo: 'exacto', titulo: 'Vajilla', precio: '$80.000', categoria: 'Casa' }, id))!
  const termo = (await createItem(h.db, euge.id, { tipo: 'exacto', titulo: 'Termo', precio: '$45.000' }, id))!
  const luna = (await createItem(h.db, rodri.id, { tipo: 'aporte', titulo: 'Luna de miel', notas: 'Nos vamos diez días al sur', aporteAlias: ALIAS, aporteMeta: 300000 }, id))!
  const token = grupo.shareToken
  const lista = (query: Record<string, string> = {}) => dibujar(ListaAjena({ params: Promise.resolve({ token }), searchParams: Promise.resolve(query) }))
  const deseo = (itemId: string) => dibujar(DetalleItem({ params: Promise.resolve({ token, itemId }), searchParams: Promise.resolve({}) }))
  return { euge, rodri, sofi, caro, id, grupo, token, vajilla, termo, luna, lista, deseo }
}

// ---------- quien regala ----------

test('la lista de un casamiento para quien regala: el aporte arriba de todo con "Aportar" y el alias a un toque, la tapa de la ocasión y el resto como siempre', async () => {
  const { token, luna, vajilla, lista } = await casamiento()
  const html = await lista()
  const t = texto(html)
  // la tapa: frambuesa, la del casamiento (no el uva de las listas en común)
  expect(html).toContain(`--c:${paletaDe('madre').fondo}`)
  // el aporte va antes que los deseos, aunque se cargó último
  expect(html.indexOf('Luna de miel')).toBeLessThan(html.indexOf('Vajilla'))
  expect(html.indexOf('Luna de miel')).toBeGreaterThan(-1)
  expect(t).toContain('Aporte en plata Luna de miel Meta: $300.000. Ponés lo que quieras, y pueden aportar todos.')
  expect(t).toContain('Nos vamos diez días al sur')
  // "Aportar" es su acción, en verde; al abrirlo (un <details>: anda sin JS) está el alias con "Copiar alias"
  expect(html).toMatch(/<summary class="gr-btn-primary[^"]*">(<svg.*?<\/svg>)?Aportar<\/summary>/)
  expect(t).toContain(`Transferí lo que quieras a este alias: ${ALIAS} Copiar alias`)
  expect(t).toContain('GiftR no mueve plata')
  // y "Ya aporté", con el monto opcional; sin nombre todavía, se lo pide ahí mismo, con la regla de la sorpresa
  expect(html).toContain('name="monto"')
  expect(html).toContain('placeholder="¿Cuánto aportaste? (opcional)"')
  expect(html).toContain('name="nombre"')
  expect(t).toContain('Euge y Rodri no se enteran por acá de quién aportó ni cuánto.')
  expect(t).toContain('Ya aporté')
  // no es un deseo de la grilla: no tiene "Reservar" (los otros dos, sí), ni foto, ni "Me lo robo"
  expect(veces(html, 'gr-btn-primary gr-btn--sm w-full')).toBe(2)
  expect(veces(html, `/l/${token}/item/${luna.id}`)).toBe(1)
  expect(veces(html, `/l/${token}/item/${vajilla.id}`)).toBe(1)
  // la vista previa del link dice que se puede aportar
  expect((await metadataDeLista({ params: Promise.resolve({ token }) })).description).toBe('3 deseos. Elegí un regalo y reservalo, o aportá lo que quieras.')
  expect((await metadataDelDeseo({ params: Promise.resolve({ token, itemId: luna.id }) })).description).toBe('Aportá lo que quieras en GiftR: no se entera por acá de quién aportó.')
})

test('con los filtros: el aporte sigue arriba en "Disponibles" y en "Hasta $X" (cada uno pone lo que quiere); con una categoría, no', async () => {
  const { euge, sofi, id, vajilla, lista } = await casamiento()
  for (const precio of ['$10.000', '$20.000', '$30.000', '$60.000']) await createItem(h.db, euge.id, { tipo: 'exacto', titulo: `Cosa de ${precio}`, precio }, id)
  h.session = { userId: sofi.id }
  await reserveItem(h.db, vajilla.id, { userId: sofi.id })
  // aunque ya se haya juntado la meta, el aporte nunca deja de estar disponible
  const caro = await usuario('Carola')
  await aportar(h.db, (await h.db.select().from(items).where(eq(items.tipo, 'aporte')))[0].id, { userId: caro.id }, 300000)

  const disponibles = await lista({ disp: '1' })
  expect(disponibles).toContain('Luna de miel')
  expect(disponibles).toContain('Termo')
  const hasta = texto(await lista({ hasta: '20000' }))
  expect(hasta).toContain('Luna de miel')
  expect(hasta).toContain('Cosa de $10.000')
  expect(hasta).not.toContain('Cosa de $60.000')
  // no cae en "Sin precio para comparar": no es un deseo sin precio, es un aporte
  expect(hasta).not.toContain('Sin precio')
  expect(hasta.indexOf('Luna de miel')).toBeLessThan(hasta.indexOf('Cosa de $10.000'))
  // con una categoría elegida se ven los de esa categoría: el aporte no tiene
  const casa = texto(await lista({ cat: 'Casa' }))
  expect(casa).toContain('Vajilla')
  expect(casa).not.toContain('Luna de miel')
})

test('"Ya aporté" sin cuenta: pide el nombre, queda anotado con su monto, y se puede deshacer; lo de los demás no lo ve (solo con cuenta)', async () => {
  const { sofi, token, luna, lista, deseo } = await casamiento()
  await aportar(h.db, luna.id, { userId: sofi.id }, 50000)
  // un monto que no es plata: se lo dice, y no anota nada
  expect(await aportarAction(null, form({ token, itemId: luna.id, nombre: 'Tía Marta', monto: 'mucho' })))
    .toEqual({ error: 'Poné cuánto aportaste en pesos, por ejemplo $20.000. Si preferís no decirlo, dejalo vacío.' })
  // sin nombre, tampoco
  expect(await aportarAction(null, form({ token, itemId: luna.id, nombre: ' ', monto: '20000' }))).toMatchObject({ error: expect.any(String) })
  expect((await h.db.select().from(claims)).length).toBe(1)

  // la tía pone su nombre y cuánto, escrito como le salga
  expect(await aportarAction(null, form({ token, itemId: luna.id, nombre: 'Tía Marta', monto: '$ 20.000' }))).toBeNull()
  const [suyo] = (await h.db.select().from(claims)).filter((c) => c.claimerGuestId)
  expect(suyo).toMatchObject({ estado: 'comprado', aporteMonto: 20000, expiresAt: null })

  let html = await lista()
  let t = texto(html)
  // ya no es la acción principal: "Ya aportaste", con lo que anotó, y que ellos no lo ven acá
  expect(html).toMatch(/<summary class="gr-btn [^"]*">(<svg.*?<\/svg>)?Ya aportaste<\/summary>/)
  expect(t).toContain('Anotado: aportaste $20.000.')
  expect(t).toContain('Euge y Rodri no ven acá quién aportó ni cuánto: lo ven en su cuenta.')
  expect(t).toContain('Me equivoqué, todavía no aporté')
  expect(html).not.toContain('name="monto"')
  // sin cuenta, en una lista que muestra los nombres solo con cuenta: de Sofi no ve nada (ni que aportó), ni el progreso
  for (const oculto of ['Sofi', 'Ya aportó', 'Ya aportaron', '$50.000', 'Van unos', 'progressbar']) expect(html, oculto).not.toContain(oculto)
  // en la página del deseo, lo mismo
  html = await deseo(luna.id)
  t = texto(html)
  expect(t).toContain('Anotado: aportaste $20.000.')
  for (const oculto of ['Sofi', 'Ya aportó', '$50.000', 'Van unos', 'progressbar']) expect(html, oculto).not.toContain(oculto)

  // se arrepiente: deja de figurar, y vuelve a tener "Aportar"
  await deshacerAporteAction(form({ token, itemId: luna.id, claimId: suyo.id }))
  expect((await h.db.select().from(claims).where(eq(claims.id, suyo.id)))[0]).toMatchObject({ estado: 'liberado', aporteMonto: null })
  html = await lista()
  expect(html).toMatch(/<summary class="gr-btn-primary[^"]*">(<svg.*?<\/svg>)?Aportar<\/summary>/)
  expect(texto(html)).not.toContain('Anotado')
  // ya con nombre, no se lo vuelve a pedir
  expect(html).toContain('name="monto"')
  expect(html).not.toContain('placeholder="Tu nombre"')
  // y sin decir cuánto también vale
  expect(await aportarAction(null, form({ token, itemId: luna.id }))).toBeNull()
  expect(texto(await lista())).toContain('Anotado: ya aportaste.')
})

test('con su cuenta: ve quiénes aportaron (los nombres, no cuánto puso cada uno) y el progreso aproximado; la página del aporte no tiene "Reservar" ni regalo grupal', async () => {
  const { sofi, caro, token, luna, lista, deseo } = await casamiento()
  await aportar(h.db, luna.id, { userId: sofi.id }, 50000)
  const [tia] = await h.db.insert(guestIdentities).values({ nombre: 'Tía Marta' }).returning()
  await aportar(h.db, luna.id, { guestId: tia.id }, 23456)
  h.session = { userId: caro.id }

  let html = await lista()
  let t = texto(html)
  expect(t).toContain('Ya aportaron Sofi y Tía Marta')
  // 73.456 anotados: se dice redondeado, y que sale de lo que anotaron
  expect(html).toContain('role="progressbar"')
  expect(t).toContain('Van unos $73.000 de $300.000, según lo que anotaron los que aportaron.')
  for (const oculto of ['$50.000', '$23.456', '23456', '50000']) expect(html, oculto).not.toContain(oculto)
  // con su cuenta no se le pide el nombre
  expect(html).not.toContain('placeholder="Tu nombre"')

  html = await deseo(luna.id)
  t = texto(html)
  expect(t).toContain('Aporte en plata')
  expect(t).toContain('Luna de miel El casamiento de Euge y Rodri Meta: $300.000 No se reserva: cada uno pone lo que quiere, y pueden aportar todos.')
  expect(t).toContain('Euge y Rodri dicen Nos vamos diez días al sur')
  expect(t).toContain('Ya aportaron Sofi y Tía Marta')
  expect(t).toContain('Van unos $73.000 de $300.000')
  // abierto de entrada: es lo único que hay para hacer
  expect(html).toMatch(/<details open=""[^>]*><summary class="gr-btn-primary/)
  expect(t).toContain(`Transferí lo que quieras a este alias: ${ALIAS} Copiar alias`)
  for (const no of ['Reservar', 'Armar regalo grupal', 'Ya lo compré', 'Verlo en', 'Este mismo', 'Me lo robo']) expect(t, no).not.toContain(no)
  // el hilo para coordinar sigue estando (lo ve quien regala con nombres)
  expect(t).toContain('Esto no lo ven Euge y Rodri')

  // Caro aporta: figura para ella con su monto, y para Sofi solo con su nombre
  expect(await aportarAction(null, form({ token, itemId: luna.id, monto: '100000' }))).toBeNull()
  expect(texto(await deseo(luna.id))).toContain('Anotado: aportaste $100.000.')
  h.session = { userId: sofi.id }
  t = texto(await lista())
  expect(t).toContain('Ya aportaron Tía Marta y Caro')
  expect(t).toContain('Anotado: aportaste $50.000.')
  expect(t).not.toContain('$100.000')
  // Tus regalos: va con lo comprado, dicho como un aporte
  const mios = await misRegalos(h.db, sofi.id)
  expect(texto(renderToStaticMarkup(createElement(FilaRegalo, { r: mios.comprados[0] })))).toContain('Luna de miel')
  expect(texto(renderToStaticMarkup(createElement(FilaRegalo, { r: mios.comprados[0] })))).toContain('Aportaste $50.000')
})

test('un pedido armado a mano no reserva un aporte, y los que arman la lista no anotan uno', async () => {
  const { euge, sofi, token, luna, lista } = await casamiento()
  h.session = { userId: sofi.id }
  expect(await redirige(reserveAction(null, form({ token, itemId: luna.id, volver: `/l/${token}` })))).toBe(`/l/${token}?reserva=no_existe`)
  expect(await h.db.select().from(claims)).toEqual([])
  // Euge, con su cuenta, por la acción directa
  h.session = { userId: euge.id }
  expect(await aportarAction(null, form({ token, itemId: luna.id, monto: '1000' }))).toEqual({ error: 'En tu propia lista no podés anotar un aporte.' })
  expect(await h.db.select().from(claims)).toEqual([])
  // y su link para regalar la manda a su lista en común, no a la vista de quien regala
  expect(await redirige(lista())).toMatch(/^\/grupos\//)
})

// ---------- los que arman la lista ----------

test('los que arman la lista: ven su aporte con el alias y la meta, y NADA de quién aportó, cuánto o cuántos, en ninguna pantalla', async () => {
  const { euge, rodri, sofi, caro, id, luna } = await casamiento()
  const pantallas = async () => {
    const todas: string[] = []
    for (const quien of [euge, rodri]) {
      h.session = { userId: quien.id }
      todas.push(
        await dibujar(ListaEnComun({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })),
        await dibujar(Deseo({ params: Promise.resolve({ id: luna.id }) })),
        await dibujar(Editar({ params: Promise.resolve({ id: luna.id }), searchParams: Promise.resolve({}) })),
      )
    }
    return todas
  }
  // los ids de los formularios de React cambian entre dibujos: no son parte de lo que se ve
  const sinIds = (s: string) => s.replace(/\$ACTION_[A-Z_]*:?[0-9a-z]*|«[^»]*»|:r[0-9a-z]+:|_R_[0-9a-zA-Z_]*/g, '')
  const antes = (await pantallas()).map(sinIds)
  await aportar(h.db, luna.id, { userId: sofi.id }, 50000)
  await aportar(h.db, luna.id, { userId: caro.id }, 77000)
  const despues = (await pantallas()).map(sinIds)
  // idénticas con aportes y sin ellos
  expect(despues).toEqual(antes)
  for (const p of despues) for (const dato of ['Sofi', 'Caro', '50.000', '77.000', '127.000', '120.000', 'Ya aport', 'Van unos', 'progressbar']) expect(p, dato).not.toContain(dato)

  // lo que sí ven: en la lista, el aporte aparte y primero, con el alias y la meta
  h.session = { userId: euge.id }
  const listaHtml = await dibujar(ListaEnComun({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }))
  expect(texto(listaHtml)).toContain(`Aporte en plata Luna de miel Meta: $300.000 · A ${ALIAS}`)
  expect(listaHtml.indexOf('Luna de miel')).toBeLessThan(listaHtml.indexOf('Vajilla'))
  // en el deseo: el alias, que lo ve cualquiera con el link, y que acá no se entera de nada
  const deseoHtml = texto(await dibujar(Deseo({ params: Promise.resolve({ id: luna.id }) })))
  expect(deseoHtml).toContain(`Transfieren a este alias ${ALIAS} Copiar alias Lo ve cualquiera que tenga el link de la lista.`)
  expect(deseoHtml).toContain('Acá no vas a ver quién aportó ni cuánto: es una sorpresa. La plata la ves en tu cuenta.')
  expect(deseoHtml).toContain('Meta: $300.000')
  // se saca de una sola manera (no "Ya lo tengo")
  expect(deseoHtml).toContain('Sacarlo de la lista')
  expect(deseoHtml).not.toContain('Ya lo tengo')
  // la grilla de Mi lista hace lo mismo con un aporte personal
  const propio = (await createItem(h.db, euge.id, { tipo: 'aporte', titulo: 'Mi bici', aporteAlias: 'euge.sola' }))!
  const grilla = renderToStaticMarkup(createElement(Fragment, null, OwnerItemsGrid({ items: [propio], shareToken: 'tok' })))
  expect(texto(grilla)).toContain('Aporte en plata Mi bici A euge.sola')
  expect(grilla).toContain(`href="/deseo/${propio.id}"`)
})

test('el formulario del aporte: llega con el alias del perfil puesto y dice quién lo va a ver; con uno mal escrito no guarda y lo explica', async () => {
  const { euge, id } = await casamiento()
  h.session = { userId: euge.id, user: { name: 'Euge' } }
  await guardarAliasPago(h.db, euge.id, 'euge.perfil')
  // desde el deseo común se ofrece pedir plata
  const comun = await dibujar(Agregar({ searchParams: Promise.resolve({ lista: id }) }))
  expect(comun).toContain(`href="/agregar?aporte=1&amp;lista=${id}"`)
  expect(texto(comun)).toContain('¿Preferís plata? Pedí un aporte: para la luna de miel, el cochecito, lo que sea')

  // desde una idea para empezar: el nombre ya viene, y el alias del perfil también (lo confirma sabiendo quién lo ve)
  const html = await dibujar(Agregar({ searchParams: Promise.resolve({ lista: id, aporte: '1', titulo: 'Luna de miel' }) }))
  const t = texto(html)
  expect(html).toMatch(/<input type="hidden" name="tipo" value="aporte"\/>/)
  expect(html).toMatch(/name="titulo"[^>]*value="Luna de miel"/)
  expect(html).toMatch(/name="aporteAlias"[^>]*value="euge\.perfil"/)
  expect(html.match(/<input[^>]*name="aporteAlias"[^>]*>/)?.[0]).toContain('required=""')
  expect(t).toContain('Este alias lo va a ver cualquiera que tenga el link de la lista.')
  expect(t).toContain('¿Cuánto querés juntar? (opcional)')
  expect(t).toContain('Acá no vas a ver quién aportó ni cuánto')
  // no es el formulario de un deseo: sin precio, link de tienda, cantidad ni "¿Cuánto lo querés?"
  for (const no of ['name="precio"', 'name="linkTienda"', 'name="cantidad"', 'name="prioridad"', 'name="repetible"']) expect(html, no).not.toContain(no)
  // va a la lista elegida
  expect(html).toMatch(new RegExp(`<option value="${id}" selected="">El casamiento de Euge y Rodri</option>`))

  // lo guarda con el alias que dejó (otro que el del perfil), en esa lista
  const url = await redirige(addItemAction(form({ tipo: 'aporte', listaId: id, titulo: 'Para la fiesta', notas: 'El DJ', aporteAlias: 'La.Fiesta.MP', aporteMeta: '$ 500.000' })))
  expect(url).toMatch(new RegExp(`^/grupos/${id}\\?agregado=`))
  const [fiesta] = await h.db.select().from(items).where(eq(items.titulo, 'Para la fiesta'))
  expect(fiesta).toMatchObject({ tipo: 'aporte', listId: id, notas: 'El DJ', aporteAlias: 'la.fiesta.mp', aporteMeta: 500000, precio: null })
  // el alias del perfil no cambió: son dos cosas distintas
  expect((await h.db.select().from(users).where(eq(users.id, euge.id)))[0].aliasPago).toBe('euge.perfil')

  // un alias mal escrito, sin alias, o una meta que no es plata: no guarda, vuelve al formulario diciendo qué
  for (const [campos, error] of [
    [{ aporteAlias: 'mío' }, 'alias'], [{ aporteAlias: '' }, 'alias'], [{ aporteAlias: ALIAS, aporteMeta: 'un montón' }, 'meta'], [{ aporteAlias: ALIAS, titulo: ' ' }, 'titulo'],
  ] as const) {
    const vuelve = await redirige(addItemAction(form({ tipo: 'aporte', listaId: id, titulo: 'No va', ...campos })))
    expect(vuelve, error).toMatch(new RegExp(`^/agregar\\?aporte=1&error=${error}&lista=${id}`))
  }
  expect(await h.db.select().from(items).where(eq(items.titulo, 'No va'))).toEqual([])
  const conError = texto(await dibujar(Agregar({ searchParams: Promise.resolve({ lista: id, aporte: '1', error: 'alias', titulo: 'No va' }) })))
  expect(conError).toContain('Eso no parece un alias ni un CVU.')

  // editar: el mismo formulario, con lo que tenía; cambia el alias y saca la meta
  const editar = await dibujar(Editar({ params: Promise.resolve({ id: fiesta.id }), searchParams: Promise.resolve({}) }))
  expect(editar).toMatch(/name="aporteAlias"[^>]*value="la\.fiesta\.mp"/)
  expect(editar).toMatch(/name="aporteMeta"[^>]*value="\$500\.000"/)
  expect(texto(editar)).toContain('Editar aporte')
  expect(await redirige(updateItemAction(form({ itemId: fiesta.id, tipo: 'aporte', titulo: 'Para la fiesta', notas: '', aporteAlias: '0000003100012345678901', aporteMeta: '' })))).toBe(`/deseo/${fiesta.id}`)
  expect((await h.db.select().from(items).where(eq(items.id, fiesta.id)))[0]).toMatchObject({ notas: null, aporteAlias: '0000003100012345678901', aporteMeta: null })
  // con un alias roto no pisa el bueno
  expect(await redirige(updateItemAction(form({ itemId: fiesta.id, tipo: 'aporte', titulo: 'Para la fiesta', aporteAlias: 'x' })))).toBe(`/editar/${fiesta.id}?error=alias`)
  expect((await h.db.select().from(items).where(eq(items.id, fiesta.id)))[0].aporteAlias).toBe('0000003100012345678901')
})

// ---------- crear la lista con su ocasión ----------

test('armar una lista en común: primero para qué es, y después el formulario con las palabras de esa ocasión', async () => {
  h.db = await createTestDb()
  const euge = await usuario('Euge')
  h.session = { userId: euge.id }
  // el primer paso: las cinco ocasiones, cada una a su formulario
  const paso1 = await dibujar(NuevaLista({ searchParams: Promise.resolve({}) }))
  const t1 = texto(paso1)
  expect(t1).toContain('¿Para qué es?')
  for (const [ocasion, nombre] of [['cumple', 'Cumple'], ['casamiento', 'Casamiento'], ['baby_shower', 'Baby shower'], ['casa_nueva', 'Casa nueva'], ['otra', 'Otra']]) {
    expect(paso1).toContain(`href="/grupos/nuevo?ocasion=${ocasion}"`)
    expect(t1).toContain(nombre)
  }
  expect(paso1).not.toContain('<form')
  // una ocasión que no existe es no haber elegido
  expect(await dibujar(NuevaLista({ searchParams: Promise.resolve({ ocasion: 'divorcio' }) }))).not.toContain('<form')

  // casamiento: el nombre sugerido, la fecha con su pregunta (una sola vez: no pregunta si se repite), sin "¿Qué es para vos?"
  const casamiento = await dibujar(NuevaLista({ searchParams: Promise.resolve({ ocasion: 'casamiento' }) }))
  const tc = texto(casamiento)
  expect(casamiento).toContain('<input type="hidden" name="ocasion" value="casamiento"/>')
  expect(casamiento).toContain('placeholder="El casamiento de Euge y Rodri"')
  expect(tc).toContain('Con los nombres de los dos')
  expect(tc).toContain('¿Cuándo es el casamiento? (opcional)')
  expect(casamiento).toContain('type="date"')
  expect(casamiento).not.toContain('name="anual"')
  expect(casamiento).not.toContain('name="parentesco"')
  expect(tc).toContain('ninguno de ustedes ve quién reserva qué ni quién aporta')
  // se puede volver a elegir
  expect(casamiento).toContain('href="/grupos/nuevo"')
  expect(tc).toContain('Casamiento Cambiar')

  // baby shower: "La llegada de…"
  const baby = await dibujar(NuevaLista({ searchParams: Promise.resolve({ ocasion: 'baby_shower' }) }))
  expect(baby).toContain('placeholder="La llegada de Olivia"')
  expect(texto(baby)).toContain('¿Cuándo es el baby shower? (opcional)')
  // cumple: día y mes, como siempre, y qué es para vos
  const cumple = await dibujar(NuevaLista({ searchParams: Promise.resolve({ ocasion: 'cumple' }) }))
  expect(texto(cumple)).toContain('¿Cuándo cumple? (opcional)')
  expect(cumple).toContain('name="dia"')
  expect(cumple).toContain('name="mes"')
  expect(cumple).not.toContain('type="date"')
  expect(cumple).toContain('name="parentesco"')
  // otra: la fecha con "se repite", como hasta ahora
  const otra = await dibujar(NuevaLista({ searchParams: Promise.resolve({ ocasion: 'otra' }) }))
  expect(otra).toContain('name="anual"')
  // en ningún paso se la llama "grupo"
  for (const p of [paso1, casamiento, baby, cumple, otra]) expect(texto(p)).not.toMatch(/\bgrupos?\b/i)
})

test('crear con cada ocasión desde el formulario: se guarda con su fecha, y la lista vacía ofrece sus ideas para empezar', async () => {
  h.db = await createTestDb()
  const euge = await usuario('Euge')
  h.session = { userId: euge.id }
  const crear = async (campos: Record<string, string>) => {
    const url = await redirige(createGroupAction(form(campos)))
    expect(url).toMatch(/^\/grupos\/[0-9a-f-]{36}$/)
    return (await h.db.select().from(lists).where(eq(lists.id, url!.slice('/grupos/'.length))))[0]
  }
  expect(await crear({ ocasion: 'casamiento', nombre: 'El casamiento de Euge y Rodri', fecha: '2027-03-20' }))
    .toMatchObject({ ocasion: 'casamiento', esCumple: false, eventoFecha: '2027-03-20', eventoAnual: false, tipo: 'grupo' })
  expect(await crear({ ocasion: 'baby_shower', nombre: 'La llegada de Olivia' })).toMatchObject({ ocasion: 'baby_shower', esCumple: false, eventoFecha: null })
  expect(await crear({ ocasion: 'casa_nueva', nombre: 'Nuestra casa', fecha: '2027-01-10' })).toMatchObject({ ocasion: 'casa_nueva', eventoAnual: false })
  // un cumple: día y mes, todos los años (aunque el formulario no mande "cumple=1": lo dice la ocasión)
  expect(await crear({ ocasion: 'cumple', nombre: 'Juancito', dia: '12', mes: '10' })).toMatchObject({ ocasion: 'cumple', esCumple: true, eventoFecha: '2000-10-12', eventoAnual: true })
  // otra: con "se repite" tildado, como siempre
  expect(await crear({ ocasion: 'otra', nombre: 'La abuela', fecha: '2027-05-01', anual: 'on' })).toMatchObject({ ocasion: 'otra', eventoAnual: true })
  // un formulario de antes (sin ocasión) sigue andando
  expect(await crear({ nombre: 'Sin ocasión', cumple: '1', dia: '3', mes: '4' })).toMatchObject({ ocasion: 'cumple', esCumple: true })
  expect(await crear({ nombre: 'Sin nada' })).toMatchObject({ ocasion: 'otra', esCumple: false })

  // la del baby shower, recién creada: vacía, con sus ideas; ninguna se agregó sola
  const [baby] = await h.db.select().from(lists).where(eq(lists.nombre, 'La llegada de Olivia'))
  const pantalla = () => dibujar(ListaEnComun({ params: Promise.resolve({ id: baby.id }), searchParams: Promise.resolve({}) }))
  let html = await pantalla()
  let t = texto(html)
  expect(await h.db.select().from(items).where(eq(items.listId, baby.id))).toEqual([])
  expect(t).toContain('Todavía no hay nada en “La llegada de Olivia”. Empiecen por las ideas de abajo, o agreguen lo que quieran.')
  expect(t).toContain('Ideas para empezar Tocá las que quieran y quedan en la lista.')
  for (const idea of ['Pañales', 'Ropa de 0 a 3 meses', 'Cuna', 'Mamaderas']) expect(html).toContain(`aria-label="Sumar ${idea} a la lista"`)
  // el cochecito es plata: va a su formulario con el nombre puesto, en esta lista
  expect(html).toContain(`href="/agregar?lista=${baby.id}&amp;aporte=1&amp;titulo=Cochecito"`)
  expect(t).toContain('Cochecito · aporte en plata')
  // la tapa y lo que se manda por WhatsApp son los del baby shower
  expect(html).toContain('--c:#0B7C78')
  expect(decodeURIComponent(html.match(/href="https:\/\/wa\.me\/\?text=([^"]*)"[^>]*>(?:<svg.*?<\/svg>)?Mandar a quienes regalan/)![1]))
    .toBe(`¡Se viene el bebé! 🍼 Armamos la lista "La llegada de Olivia" en GiftR. Elegí algo y reservalo, o aportá para lo más grande: nosotros no vemos quién regala qué.\n/l/${baby.shareToken}`)

  // toca "Pañales" y "Cuna": quedan en la lista y dejan de ofrecerse; las demás siguen
  await sumarDeseoSugeridoAction(form({ grupoId: baby.id, titulo: 'Pañales' }))
  await sumarDeseoSugeridoAction(form({ grupoId: baby.id, titulo: 'Cuna' }))
  // lo que no es una idea de su ocasión no entra por acá
  await sumarDeseoSugeridoAction(form({ grupoId: baby.id, titulo: 'Vajilla' }))
  expect((await grupoParaDueno(h.db, baby.id, euge.id))!.items.map((i) => i.titulo)).toEqual(['Pañales', 'Cuna'])
  html = await pantalla()
  t = texto(html)
  expect(html).not.toContain('aria-label="Sumar Pañales a la lista"')
  expect(html).not.toContain('aria-label="Sumar Cuna a la lista"')
  expect(html).toContain('aria-label="Sumar Mamaderas a la lista"')
  expect(t).not.toContain('Todavía no hay nada')
  // un cumple y "otra" no traen ideas
  const [cumple] = await h.db.select().from(lists).where(eq(lists.nombre, 'Juancito'))
  expect(texto(await dibujar(ListaEnComun({ params: Promise.resolve({ id: cumple.id }), searchParams: Promise.resolve({}) })))).not.toContain('Ideas para empezar')
  // y nunca "grupo"
  expect(t.replace(/\/grupos\/unirme\//g, '')).not.toMatch(/\bgrupos?\b/i)
})
