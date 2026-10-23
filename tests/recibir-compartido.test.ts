import { describe, expect, test, vi } from 'vitest'
import { completador, loQueEntro, type Valores } from '@/lib/completar-deseo'
import type { DelBuzon } from '@/lib/buzon-compartido'
import {
  compartidoAutomatico, esRutaAgregar, loCompartido, queHacerConLoCompartido, rutaAgregar, VUELTA_MAX,
} from '@/lib/recibir-compartido'
import { comoEscrito, comoPegado } from '@/components/RecibirCompartido'

// Lo que llega al compartir a GiftR desde otra app (Android manda title y text; el atajo del iPhone, url), y adónde va.

const ML = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-imperial-de-calabaza-_JM'
const ID = '0b6a3a9e-5d2c-4f1e-9a7b-3c4d5e6f7a8b'

describe('loCompartido', () => {
  test('el texto de la app de MercadoLibre da solo el link (lo de al lado quedaría de título)', () => {
    expect(loCompartido({ text: `Mirá este producto en Mercado Libre ${ML}` })).toEqual({ link: ML })
    expect(loCompartido({ title: 'Mercado Libre', text: `Mirá este producto en Mercado Libre\n${ML}` })).toEqual({ link: ML })
  })

  test('Chrome compartiendo una página (title = el <title>, text = la URL) da el link', () => {
    expect(loCompartido({ title: 'Mate Imperial De Calabaza | MercadoLibre', text: ML })).toEqual({ link: ML })
  })

  test('un link que está solo en title se toma, y url gana sobre text (y text sobre title)', () => {
    expect(loCompartido({ title: ML })).toEqual({ link: ML })
    expect(loCompartido({ title: `Mirá ${ML}`, text: 'sin link' })).toEqual({ link: ML })
    expect(loCompartido({ url: 'https://a.co/d/abc123', text: ML })).toEqual({ link: 'https://a.co/d/abc123' })
    expect(loCompartido({ text: 'https://www.zara.com/ar/es/remera-p1.html', title: ML })).toEqual({ link: 'https://www.zara.com/ar/es/remera-p1.html' })
  })

  test('los links cortos y los de Instagram con su ?igsh= quedan tal cual', () => {
    expect(loCompartido({ text: 'https://meli.la/2abcXYZ' })).toEqual({ link: 'https://meli.la/2abcXYZ' })
    const ig = 'https://www.instagram.com/p/C1a2B3c4D5e/?igsh=MWZ5bHk0dGZ3b2ZxNQ=='
    expect(loCompartido({ text: ig })).toEqual({ link: ig })
  })

  test('texto sin link: la primera línea es el título, y el texto entero va a notas si no entra o tiene más líneas', () => {
    expect(loCompartido({ text: 'Mate de calabaza' })).toEqual({ titulo: 'Mate de calabaza', notas: null })
    expect(loCompartido({ text: '\n  Mate de calabaza\ncon bombilla de alpaca\n' }))
      .toEqual({ titulo: 'Mate de calabaza', notas: 'Mate de calabaza\ncon bombilla de alpaca' })
    const largo = `Un mate ${'muy '.repeat(40)}lindo`
    const c = loCompartido({ text: largo })
    expect(c?.titulo).toBe(largo.slice(0, 120).trim())
    expect(c?.notas).toBe(largo)
    // sin text, el title (una app de notas que manda solo el título)
    expect(loCompartido({ title: 'Termo Stanley verde' })).toEqual({ titulo: 'Termo Stanley verde', notas: null })
  })

  test('un título que es el nombre de un archivo (lo que manda la galería con una foto) se ignora, y no pasa por un link', () => {
    for (const title of ['IMG_20261022_101010.jpg', 'PXL_20261022_101010123', 'foto.heic', 'mate.png', 'Screenshot_20261022-101010_Chrome.jpg',
      'Captura de pantalla 2026-10-22 a las 10.10.10.png']) {
      expect(loCompartido({ title }), title).toBeNull()
      expect(loCompartido({ text: title }), title).toBeNull()
    }
    // con una barra es un link (el de una foto), y un texto que empieza parecido no es un archivo
    expect(loCompartido({ title: 'https://http2.mlstatic.com/D_123-O.jpg' })).toEqual({ link: 'https://http2.mlstatic.com/D_123-O.jpg' })
    expect(loCompartido({ text: 'IMG de regalo para el día del padre' })?.titulo).toBe('IMG de regalo para el día del padre')
    expect(loCompartido({ text: 'WhatsApp Image 2026-10-22 at 10.10.10.jpeg' })).toBeNull()
  })

  test('un texto que termina en ".jpg" o ".png" no es un archivo: con espacios y sin números, o de varias líneas', () => {
    expect(loCompartido({ text: 'Me gusta este mate.jpg' })).toEqual({ titulo: 'Me gusta este mate.jpg', notas: null })
    expect(loCompartido({ text: 'Regalos para mamá\nla taza de la foto.png' }))
      .toEqual({ titulo: 'Regalos para mamá', notas: 'Regalos para mamá\nla taza de la foto.png' })
    expect(loCompartido({ title: 'Captura de pantalla 2026-10-22 a las 10.10.10.png\nmate' })?.titulo).toBe('Captura de pantalla 2026-10-22 a las 10.10.10.png')
    // uno largo con espacios y números es un texto; sin espacios, un archivo (si no, pasaría por un link)
    const nota = `Lista de regalos 2026: ${'una taza '.repeat(10)}la de la foto.png`
    expect(loCompartido({ text: nota })?.notas).toBe(nota)
    expect(loCompartido({ text: `${'a'.repeat(200)}.png` })).toBeNull()
  })

  test('algo con forma de link que no sirve (de más de 2000 caracteres) no queda cortado en el título ni en las notas', () => {
    const largo = `https://www.otro-sitio.com/p/${'a'.repeat(2100)}`
    expect(loCompartido({ text: largo })).toBeNull()
    expect(loCompartido({ text: `www.otro-sitio.com/p/${'a'.repeat(2100)}` })).toBeNull()
    expect(loCompartido({ text: `Mirá esto ${largo} qué lindo` })).toEqual({ titulo: 'Mirá esto qué lindo', notas: null })
    expect(loCompartido({ text: `Para mamá\n${largo}\nel azul` })).toEqual({ titulo: 'Para mamá', notas: 'Para mamá\n\nel azul' })
    // Chrome con una página de link enorme: queda el <title>
    expect(loCompartido({ title: 'Mate imperial | Otro sitio', text: largo })).toEqual({ titulo: 'Mate imperial | Otro sitio', notas: null })
    // el que sí sirve, aunque venga después
    expect(loCompartido({ text: `${largo} o este ${ML}` })).toEqual({ link: ML })
    // por la URL (?texto=) tampoco vuelve como un link
    expect(rutaAgregar({ compartido: loCompartido({ text: `Mirá ${largo}` }) })).toBe('/agregar?texto=Mir%C3%A1')
  })

  test('sin caracteres de control ni bidi, y javascript: no es un link', () => {
    expect(loCompartido({ text: 'Ma\u0000te‮ de calabaza' })).toEqual({ titulo: 'Mate de calabaza', notas: null })
    expect(loCompartido({ url: 'javascript:alert(1)' })).toBeNull()
    expect(loCompartido({ text: 'javascript:alert(1)' })).toEqual({ titulo: 'javascript:alert(1)', notas: null })
    expect(loCompartido({ text: 'data:text/html,<b>hola</b>' })?.link).toBeUndefined()
  })

  test('vacío da null, lo que no es un string se ignora, y un texto de 1 MB se corta', () => {
    expect(loCompartido({})).toBeNull()
    expect(loCompartido({ title: '  ', text: '\n\n', url: '' })).toBeNull()
    expect(loCompartido({ title: 42, text: ['a'], url: { href: ML } })).toBeNull()
    const mega = 'a'.repeat(1024 * 1024)
    const c = loCompartido({ text: mega })
    expect(c?.titulo).toHaveLength(120)
    expect(c?.notas).toHaveLength(500)
  })
})

describe('rutaAgregar', () => {
  const salidas = [
    rutaAgregar({}),
    rutaAgregar({ buzon: ID, auto: true }),
    rutaAgregar({ buzon: ID }),
    rutaAgregar({ compartido: { link: ML } }),
    rutaAgregar({ compartido: { link: 'https://otro.com/x?a=1&b=<script>' }, sinFoto: true }),
    rutaAgregar({ compartido: loCompartido({ text: 'Mate de calabaza\ncon bombilla & yerba "verde"' }) }),
    rutaAgregar({ sinFoto: true }),
  ]

  test('siempre /agregar, y lo que sale lo acepta esRutaAgregar', () => {
    for (const s of salidas) {
      expect(s.startsWith('/agregar'), s).toBe(true)
      expect(esRutaAgregar(s), s).toBe(true)
    }
    expect(rutaAgregar({})).toBe('/agregar')
  })

  test('el buzón con auto=1 solo si se pide, auto sin buzón no va, y un id que no es uno se ignora', () => {
    expect(rutaAgregar({ buzon: ID, auto: true })).toBe(`/agregar?compartido=${ID}&auto=1`)
    expect(rutaAgregar({ buzon: ID })).toBe(`/agregar?compartido=${ID}`)
    expect(rutaAgregar({ auto: true, compartido: { link: ML } })).toBe(`/agregar?link=${encodeURIComponent(ML)}`)
    expect(rutaAgregar({ buzon: '../x', auto: true })).toBe('/agregar')
    expect(rutaAgregar({ buzon: `${ID}x` })).toBe('/agregar')
  })

  test('otro sitio aparece solo como el valor de link, nunca como destino', () => {
    const r = rutaAgregar({ compartido: { link: 'https://otro.com' } })
    expect(r).toBe('/agregar?link=https%3A%2F%2Fotro.com')
    expect(new URL(r, 'https://giftr.test').origin).toBe('https://giftr.test')
    expect(new URL(r, 'https://giftr.test').searchParams.get('link')).toBe('https://otro.com')
  })

  test('el texto va entero (las notas) y vuelve a dar lo mismo; foto=no cuando corresponde', () => {
    const c = loCompartido({ text: 'Mate de calabaza\ncon bombilla' })
    const r = rutaAgregar({ compartido: c, sinFoto: true })
    const q = new URL(r, 'https://giftr.test').searchParams
    expect(q.get('foto')).toBe('no')
    expect(loCompartido({ text: q.get('texto') })).toEqual(c)
    expect(rutaAgregar({ compartido: { link: ML } })).not.toContain('foto=')
  })

  test('sin tope: un link largo va entero (el tope es solo para la vuelta del login)', () => {
    const largo = `${ML}?${'x'.repeat(1800)}`
    expect(rutaAgregar({ compartido: { link: largo } }).length).toBeGreaterThan(VUELTA_MAX)
  })
})

test('esRutaAgregar: solo /agregar con lo que da URLSearchParams', () => {
  for (const v of ['/agregar', `/agregar?compartido=${ID}&auto=1`, '/agregar?link=https%3A%2F%2Fa.co%2Fd%2Fx&foto=no', '/agregar?texto=Mate+de+calabaza']) {
    expect(esRutaAgregar(v), v).toBe(true)
  }
  for (const v of ['//otro.com', '/\\otro', 'https://giftr.test/agregar', '/agregarx', '/mi-lista', '/agregar?x=<b>', '/agregar/../l/x',
    '/agregar?x=1#y', '/agregar?x=//otro.com', '']) {
    expect(esRutaAgregar(v), v).toBe(false)
  }
})

test('compartidoAutomatico: desde GiftR o desde otra app sí; desde otro sitio o sin Sec-Fetch-Site, solo con el buzón y auto=1', () => {
  for (const sitio of ['none', 'same-origin']) expect(compartidoAutomatico({ sitio }), sitio).toBe(true)
  // sin el encabezado (Safari antes de 16.4, Firefox antes de 90) cualquier sitio pasaría
  for (const sitio of [null, '', 'cross-site', 'same-site']) expect(compartidoAutomatico({ sitio }), String(sitio)).toBe(false)
  expect(compartidoAutomatico({ sitio: null, buzon: ID, auto: '1' })).toBe(true)
  expect(compartidoAutomatico({ sitio: 'cross-site', buzon: ID, auto: '1' })).toBe(true)
  expect(compartidoAutomatico({ sitio: 'cross-site', buzon: ID })).toBe(false)
  expect(compartidoAutomatico({ sitio: 'cross-site', auto: '1' })).toBe(false)
  expect(compartidoAutomatico({ sitio: 'cross-site', buzon: 'no-es-un-id', auto: '1' })).toBe(false)
  expect(compartidoAutomatico({ sitio: 'same-site', buzon: ID, auto: 'si' })).toBe(false)
})

describe('queHacerConLoCompartido', () => {
  const foto = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
  const del = (r: Partial<DelBuzon>): DelBuzon => ({ title: '', text: '', url: '', foto: null, fotoRechazada: false, ...r })
  const vacio = { automatico: true, titulo: '', notas: '' }

  test('link y foto, automático: el link al título como un pegado (se busca) y la foto se sube', () => {
    expect(queHacerConLoCompartido(del({ text: `Mirá este producto en Mercado Libre ${ML}`, foto }), vacio))
      .toEqual({ titulo: ML, pegar: ML, foto, fotoNoLlego: false })
  })

  test('no pisa un título ni unas notas ya escritos (y entonces no hay nada que buscar)', () => {
    expect(queHacerConLoCompartido(del({ text: ML }), { ...vacio, titulo: 'Mi mate' })).toEqual({ fotoNoLlego: false })
    const texto = del({ text: 'Mate de calabaza\ncon bombilla' })
    expect(queHacerConLoCompartido(texto, { ...vacio, notas: 'el negro' })).toEqual({ titulo: 'Mate de calabaza', fotoNoLlego: false })
    expect(queHacerConLoCompartido(texto, { ...vacio, titulo: '  ' }))
      .toEqual({ titulo: 'Mate de calabaza', notas: 'Mate de calabaza\ncon bombilla', fotoNoLlego: false })
  })

  test('si no es automático no hay foto ni búsqueda: el link queda en el título y la foto no llegó', () => {
    expect(queHacerConLoCompartido(del({ text: ML, foto }), { ...vacio, automatico: false }))
      .toEqual({ titulo: ML, fotoNoLlego: true })
    // solo un link automático entra como pegado: un texto, nunca (entra como escrito)
    expect(queHacerConLoCompartido(del({ text: 'Mate' }), { ...vacio, automatico: false })).toEqual({ titulo: 'Mate', fotoNoLlego: false })
    expect(queHacerConLoCompartido(del({ text: 'Mate' }), vacio)).toEqual({ titulo: 'Mate', fotoNoLlego: false })
  })

  test('un link de más de 2000 caracteres no deja un pedazo en el título, que se buscaría como uno pegado', () => {
    const largo = `https://www.otro-sitio.com/p/${'a'.repeat(2100)}`
    expect(queHacerConLoCompartido(del({ text: largo }), { ...vacio, automatico: false })).toEqual({ fotoNoLlego: false })
    expect(queHacerConLoCompartido(del({ text: `Mirá ${largo}` }), { ...vacio, automatico: false }))
      .toEqual({ titulo: 'Mirá', fotoNoLlego: false })
  })

  test('una foto que el service worker no tomó da fotoNoLlego; solo foto deja el título vacío', () => {
    expect(queHacerConLoCompartido(del({ fotoRechazada: true }), vacio)).toEqual({ fotoNoLlego: true })
    expect(queHacerConLoCompartido(del({ title: 'IMG_20261022_101010.jpg', foto }), vacio)).toEqual({ foto, fotoNoLlego: false })
  })
})

test('lo compartido entra en el título como un pegado: CompletarDesdeLink lo toma como tal y lo busca en el momento', () => {
  const init = comoPegado(ML)
  expect(init).toMatchObject({ bubbles: true, inputType: 'insertFromPaste', data: ML })
  expect(loQueEntro({ inputType: init.inputType, data: init.data })).toBe(ML)
})

test('lo demás entra como escrito: un input común (no un InputEvent), y un link no se pide hasta dejar el campo', async () => {
  const e = comoEscrito()
  expect(e).toBeInstanceOf(Event)
  expect(e).toMatchObject({ type: 'input', bubbles: true })
  expect('inputType' in e).toBe(false)
  // lo que hace CompletarDesdeLink con un input que no es un InputEvent: alCambiar(null)
  const v: Valores = { titulo: ML, linkTienda: '', precio: '' }
  const pedir = vi.fn(async () => undefined)
  const c = completador({ guardado: null, leer: () => v, escribir: () => {}, mostrar: () => {}, pedir })
  c.alCambiar(null)
  await Promise.resolve()
  expect(pedir).not.toHaveBeenCalled()
  // ni al ir a "Agregar"
  c.alDejar('titulo', 'enviar')
  expect(pedir).not.toHaveBeenCalled()
  c.alDejar('titulo', 'precio')
  expect(pedir).toHaveBeenCalledOnce()
  c.cerrar()
})
