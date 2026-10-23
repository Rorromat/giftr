import { describe, expect, test, vi } from 'vitest'
import { leerPagina } from '@/lib/pagina-de-afuera'
import {
  esPaginaBloqueada, esUrlDeMuro, fotoGrande, leerProducto, limpiarTitulo, montoDeTexto, precioParaElForm, type Estado,
} from '@/lib/producto-del-link'
import { casos, cuerpo, fixture, type Fixture } from './fixtures/links/leer'
import { servidor } from './helpers'

// Qué sale de cada página de producto de los fixtures (páginas de verdad): estado, nombre, precio y foto.

/** Lo que tendría que dar cada fixture según su expected (diseño 12.1). */
function esperadoDe(f: Fixture): { estado: Estado; titulo: string | null; precio: string | null; foto: string | null } {
  const e = f.expected
  const estado: Estado = e.blocked ? 'bloqueado' : e.notFound || e.tipo === 'no-disponible' ? 'no-esta'
    : e.genericPage || e.tipo === 'no-producto' || e.pageKind === 'store' ? 'sin-datos' : 'ok'
  const precio = e.price == null ? null : precioParaElForm(Number(e.price), e.currency ?? null, new URL(f.urlFinal).hostname)
  return { estado, titulo: e.title ?? null, precio, foto: e.image ?? null }
}

// Las diferencias aceptadas con el expected (diseño 12.2): ninguna completa algo equivocado.
const DIFERENCIAS: Record<string, Partial<ReturnType<typeof esperadoDe>> & { porque: string }> = {
  'aliexpress-1': {
    porque: 'más de 120 caracteres: se corta en la última palabra',
    titulo: 'BLUX Gravity Minnow 50mm 4.3g Long Cast Heavy Shinking Fishing Lure Wobbler Freshwater Saltwater Bass Pike Hard Plastic',
  },
  'aliexpress-2': {
    porque: 'más de 120 caracteres',
    titulo: "PUAIA Print Men's Pants Autumn/Winter New Sport Jogging Trousers Fitness Loose Fit Clothing Solid Color Outfit",
  },
  'amazon-2': {
    porque: 'más de 120 caracteres',
    titulo: 'Amazon Echo Dot (newest model) - Vibrant sounding speaker, Designed for Alexa+, Great for bedrooms, dining rooms and',
  },
  'amazon-4': {
    porque: 'más de 120 caracteres',
    titulo: 'WUBEN X4 Linterna Led Recargable, Linterna Táctica con Iluminación RGB | 1500lúmenes, interruptor táctico, ajuste de',
  },
  'etsy-1': {
    porque: 'más de 120 caracteres',
    titulo: 'Animals Puzzle With Custom Baby Name, Personalized Name Puzzle, Zuzu Puzzle Licensed Puzzle, Baby Girl Gift, Baby Boy',
  },
  'temu-2': { porque: 'los espacios de más se colapsan', titulo: '1 mate yerba bombilla taza acero inoxidable mate taza' },
  'temu-1': {
    porque: 'solo og:title (sin foto ni precio): el rawData de Temu no se lee',
    titulo: '1pc yerba mate gourd bombilla stainless steel yerba mate cup', precio: null, foto: null,
  },
  'steam-1': { porque: 'el og:title de Steam queda con «» hasta la fase 2', titulo: '«Hades» en Steam' },
  'steam-3': { porque: 'el og:title de Steam queda así hasta la fase 2', titulo: 'Ahorra un 70 % en «Cyberpunk 2077» en Steam' },
  'mercadolibre-15': {
    porque: 'clip: el og es el del video; el producto está en el JSON polycard (fase 2)',
    titulo: 'Termo Stanley Mate System 1.2 Litros Rosa', precio: null,
    foto: 'https://http2.mlstatic.com/D_NQ_NP_900749-MLA85160086562_052025-B.webp',
  },
  'booking-1': {
    porque: 'la foto sale del JSON-LD (Hotel.image), que va antes que og:image',
    foto: 'https://cf.bstatic.com/xdata/images/hotel/max500/434380858.jpg?k=71b9c8cf80477a360b55c216c118a4595e8658f8dc7b0d776e2a911c76919b26&o=&hp=1',
  },
  'zara-1': {
    porque: 'la del JSON-LD es la misma foto que og:image, sin &f=auto',
    foto: 'https://static.zara.net/assets/public/0a76/6175/572e4c5f8a5b/a2966ea40eea/04087840500-p/04087840500-p.jpg?ts=1790150077079&w=560',
  },
  'amazon-1': { porque: 'capturada sin og:* (con nuestro User-Agent Amazon sí manda og: en producción es "parcial")', estado: 'sin-datos' },
  'amazon-5': { porque: 'capturada sin og:*, igual que amazon-1', estado: 'sin-datos' },
  'spotify-2': { porque: 'la SPA no trae og ni JSON-LD', estado: 'sin-datos' },
  'steam-2': { porque: 'la página de la edad no tiene señal de producto', estado: 'sin-datos' },
  'airbnb-3': { porque: 'un form que se manda solo ("Redirigiendo a es.airbnb.com"), sin og ni JSON-LD', estado: 'sin-datos' },
}

// Redirecciones y respuestas JSON: se prueban en pagina-de-afuera.test.ts o son de la fase 2
const APARTE = ['redireccion', 'redireccion-js', 'api-json']
const PAGINAS = casos().filter((c) => !APARTE.includes(fixture(c).expected.tipo ?? '') && !fixture(c).expected.redirect)

/** La página del fixture servida en su URL final, y lo que lee el route de ella (bajarPagina + leerProducto + slug). */
async function leerFixture(caso: string) {
  const f = fixture(caso)
  // amazon-5 se capturó sin el content-type (Amazon manda text/html)
  const s = servidor({ [f.urlFinal]: { status: f.status, headers: { 'content-type': f.contentType ?? 'text/html' }, cuerpo: cuerpo(caso) } })
  const r = await leerPagina(f.urlFinal, s.pedir)
  return { estado: r.estado, ...r.producto, pedidos: s.urls() }
}

describe('cada fixture da lo de su expected, salvo las diferencias aceptadas', () => {
  test('están todos los fixtures', () => {
    expect(casos()).toHaveLength(99)
    expect(PAGINAS).toHaveLength(86)
    for (const c of Object.keys(DIFERENCIAS)) expect(PAGINAS, c).toContain(c)
  })

  test.each(PAGINAS)('%s', async (caso) => {
    const r = await leerFixture(caso)
    const { porque, ...distinto } = DIFERENCIAS[caso] ?? { porque: 'como dice el expected' }
    const esperado = { ...esperadoDe(fixture(caso)), ...distinto }
    expect(r.estado, porque).toBe(esperado.estado)
    if (r.estado === 'ok') expect({ titulo: r.titulo, precio: r.precio, foto: r.foto }, porque).toEqual({ titulo: esperado.titulo, precio: esperado.precio, foto: esperado.foto })
    else {
      // de una página que no se leyó no queda nada: ni el título del muro ni la foto de la home
      expect(r.precio).toBeNull()
      expect(r.foto).toBeNull()
      expect(r.titulo ?? '').not.toMatch(/^adidas$|access denied|attention required|just a moment|captcha|robot|web player|redirigiendo|amazon\.(com|es)$/i)
    }
  })
})

test('las 36 que tienen que salir completas (nombre, foto y precio)', async () => {
  const completas = [
    'oncity-1', 'jumbo-1', 'naldo-1', 'farmacity-1', 'sbs-1', 'mimo-1', 'sporting-1', 'carrefour-1', 'crocs-1', 'havaianas-1',
    'reebok-1', 'yenny-1', 'romaobjetos-1', 'companiadesombreros-1', 'prune-1', 'megatone-1', 'dexter-1', 'puma-1', 'samsung-1',
    'cuspide-1', 'grimoldi-1', 'mercadolibre-1', 'mercadolibre-2', 'mercadolibre-3', 'mercadolibre-4', 'mercadolibre-5',
    'mercadolibre-6', 'mercadolibre-7', 'mercadolibre-8',
    'apple-1', 'nike-1', 'ikea-1', 'decathlon-1', 'zara-1', 'steam-1', 'steam-3',
  ]
  for (const c of completas) {
    const r = await leerFixture(c)
    expect([c, r.estado, !!r.titulo, !!r.foto, !!r.precio]).toEqual([c, 'ok', true, true, true])
  }
  // los que la diseño nombra por algo en particular
  expect((await leerFixture('jumbo-1')).precio).toBe('$16.750') // el regular, no el promocional (11725)
  expect(await leerFixture('carrefour-1')).toMatchObject({ titulo: 'Lomito de atún al natural Carrefour Classic 170 grs', precio: '$2.590' })
  expect((await leerFixture('crocs-1')).precio).toBe('$99.999')
  expect((await leerFixture('havaianas-1')).precio).toBe('$38.999')
  expect((await leerFixture('mercadolibre-1')).titulo).toBe('Mate De Algarrobo Premium Artesanal Con Bombilla')
  expect((await leerFixture('mercadolibre-6')).precio).toBe('US$ 309.000')
  expect((await leerFixture('mercadolibre-8')).precio).toBe('$55.820.020')
  expect((await leerFixture('decathlon-1')).precio).toBe('US$ 9,99')
  expect((await leerFixture('samsung-1')).foto).not.toMatch(/logo/i)
})

test('los muros no se piden (y el nombre sale del link que se quería ver)', async () => {
  for (const c of ['mercadolibre-10', 'mercadolibre-11', 'shein-1', 'shein-2', 'youtube-1']) {
    const r = await leerFixture(c)
    expect([c, r.estado, r.pedidos]).toEqual([c, 'bloqueado', []])
  }
  expect((await leerFixture('mercadolibre-10')).titulo).toBe('Mate de algarrobo premium artesanal con bombilla')
  expect((await leerFixture('shein-1')).titulo).toBe('DAZY Women s White Long Sleeve Square Neck Blouse')
})

describe('montoDeTexto', () => {
  test('el formato de cada tienda', () => {
    for (const [texto, monto] of [
      ['99.999', 99999], ['38,999', 38999], ['30.900,00', 30900], ['99999.00', 99999], ['1.229.999', 1229999], ['24.99', 24.99],
      ['1,234.56', 1234.56], ['$ 88.990', 88990], ['US$ 7.93', 7.93], ['129.0', 129], ['115', 115],
    ] as const) expect(montoDeTexto(texto), texto).toBe(monto)
    expect(montoDeTexto(16750)).toBe(16750)
    expect(montoDeTexto(1e3)).toBe(1000)
  })

  test('lo que no es un precio da null', () => {
    for (const v of ['0,00', '0', 0, -5, '-5', '$ -5.000', '- 5000', '1e3', '1'.repeat(25), true, false, null, undefined, NaN, 1e10, '', '$', {}, []]) {
      expect(montoDeTexto(v), String(v)).toBeNull()
    }
  })
})

describe('precioParaElForm', () => {
  test('pesos y dólares', () => {
    expect(precioParaElForm(88990, 'ARS', 'www.mercadolibre.com.ar')).toBe('$88.990')
    expect(precioParaElForm(88990.6, 'ars', 'x.com')).toBe('$88.991')
    expect(precioParaElForm(309000, 'USD', 'departamento.mercadolibre.com.ar')).toBe('US$ 309.000')
    expect(precioParaElForm(79.99, 'USD', 'www.amazon.com')).toBe('US$ 79,99')
    expect(precioParaElForm(29.9, 'USD', 'www.zara.com')).toBe('US$ 29,90')
    expect(precioParaElForm(9.999, 'USD', 'x.com')).toBe('US$ 10')
  })

  test('otra moneda no: el regalo grupal la leería como pesos', () => {
    for (const m of ['EUR', 'MXN', 'BRL', 'CLP']) expect(precioParaElForm(100, m, 'www.tienda.com.ar'), m).toBeNull()
  })

  test('sin moneda: pesos solo si la tienda es .ar', () => {
    expect(precioParaElForm(99999, null, 'www.crocs.com.ar')).toBe('$99.999')
    expect(precioParaElForm(99999, null, 'www.crocs.com.ar.')).toBe('$99.999')
    expect(precioParaElForm(99999, null, 'www.crocs.com')).toBeNull()
    expect(precioParaElForm(null, 'ARS', 'x.com.ar')).toBeNull()
  })

  test('lo que redondeado da 0 es sin precio (el 0,01 de "precio a consultar")', () => {
    expect(precioParaElForm(0.01, 'ARS', 'x.com.ar')).toBeNull()
    expect(precioParaElForm(0.49, null, 'x.com.ar')).toBeNull()
    expect(precioParaElForm(0.004, 'USD', 'x.com')).toBeNull()
    expect(precioParaElForm(0.5, 'ARS', 'x.com')).toBe('$1')
    expect(precioParaElForm(0.01, 'USD', 'x.com')).toBe('US$ 0,01')
  })

  test('siempre entra en el campo', () => {
    for (const [n, m] of [[9_999_999_999, 'ARS'], [9_999_999_999.99, 'USD']] as const) {
      expect((precioParaElForm(n, m, 'x.com') ?? '').length).toBeLessThanOrEqual(40)
    }
  })
})

describe('limpiarTitulo', () => {
  test('sin el precio que ML agrega al final', () => {
    expect(limpiarTitulo('Mate De Algarrobo Premium - $ 88.990', null, 'articulo.mercadolibre.com.ar')).toBe('Mate De Algarrobo Premium')
    expect(limpiarTitulo('Departamento En Venta - US$ 309.000', null, 'departamento.mercadolibre.com.ar')).toBe('Departamento En Venta')
    // un guion que no es del precio queda
    expect(limpiarTitulo('Toyota Hilux Pick-up 2.4', null, 'auto.mercadolibre.com.ar')).toBe('Toyota Hilux Pick-up 2.4')
  })

  test('sin el nombre del sitio, al final o al principio', () => {
    expect(limpiarTitulo('Celular Motorola Moto G06 - On City', 'On City', 'www.oncity.com')).toBe('Celular Motorola Moto G06')
    expect(limpiarTitulo('Galaxy A37 5G | Samsung Argentina', null, 'www.samsung.com')).toBe('Galaxy A37 5G')
    expect(limpiarTitulo('Puzzle de madera - Etsy', null, 'www.etsy.com')).toBe('Puzzle de madera')
    expect(limpiarTitulo('Señuelo Minnow - AliExpress 18', null, 'es.aliexpress.com')).toBe('Señuelo Minnow')
    expect(limpiarTitulo('Amazon.com: Echo Dot', null, 'www.amazon.com')).toBe('Echo Dot')
    // el nombre del host es el del sitio, no el subdominio (store.)
    expect(limpiarTitulo('Hades · Steam', null, 'store.steampowered.com')).toBe('Hades')
    // lo que no es el sitio queda
    expect(limpiarTitulo('AMIGOS POR EL VIENTO - LILIANA BODOC', 'SBS Librería', 'www.sbs.com.ar')).toBe('AMIGOS POR EL VIENTO - LILIANA BODOC')
    expect(limpiarTitulo('Remera - M', null, 'www.mimo.com.ar')).toBe('Remera - M')
  })

  test('el sitio con lo que se le agrega, y lo que sigue después', () => {
    expect(limpiarTitulo('Crocs Classic Moc – Crocs Argentina | Sitio Oficial', 'Crocs Argentina | Sitio Oficial', 'www.crocs.com.ar')).toBe('Crocs Classic Moc')
    expect(limpiarTitulo('Cerveza Quilmes x 6 - Jumbo Argentina | Aprovechá las Ofertas I Supermercado Online', null, 'www.jumbo.com.ar')).toBe('Cerveza Quilmes x 6')
    expect(limpiarTitulo('REMERA JR STYLE - Mimo & Co | Ropa y calzado para niñas', null, 'www.mimo.com.ar')).toBe('REMERA JR STYLE')
    expect(limpiarTitulo('MACETA DUOMO GRANDE - Comprar en Roma objetos', null, 'www.romaobjetos.com.ar')).toBe('MACETA DUOMO GRANDE')
    expect(limpiarTitulo('AMIGOS POR EL VIENTO - LILIANA BODOC - SBS Librerías', null, 'www.sbs.com.ar')).toBe('AMIGOS POR EL VIENTO - LILIANA BODOC')
    expect(limpiarTitulo('Basic T-Shirt - Green | ZARA United States', null, 'www.zara.com')).toBe('Basic T-Shirt - Green')
    // sin tildes, como en el host
    expect(limpiarTitulo('ANTES DE QUE SE ENFRIE EL CAFE – Cúspide', null, 'cuspide.com')).toBe('ANTES DE QUE SE ENFRIE EL CAFE')
  })

  test('el nombre de la marca con el modelo no es el sitio: el modelo queda', () => {
    expect(limpiarTitulo('Zapatillas Running - Nike Pegasus 41', 'Nike.com', 'www.nike.com.ar')).toBe('Zapatillas Running - Nike Pegasus 41')
    expect(limpiarTitulo('Termo 1L - Stanley Classic Legendary', null, 'www.stanley.com.ar')).toBe('Termo 1L - Stanley Classic Legendary')
    expect(limpiarTitulo('Smart TV 50 pulgadas - Samsung Crystal UHD', null, 'www.samsung.com')).toBe('Smart TV 50 pulgadas - Samsung Crystal UHD')
    expect(limpiarTitulo('Cafetera Express: Oster Prima', null, 'www.oster.com.ar')).toBe('Cafetera Express: Oster Prima')
    // por palabras enteras: "Mimosa" no es "Mimo"
    expect(limpiarTitulo('Remera - Mimosa', null, 'www.mimo.com.ar')).toBe('Remera - Mimosa')
  })

  test('un título que es solo el nombre del sitio no queda vacío', () => {
    expect(limpiarTitulo('Samsung', 'Samsung', 'www.samsung.com')).toBe('Samsung')
    expect(limpiarTitulo('Samsung | Samsung', 'Samsung', 'www.samsung.com')).toBe('Samsung')
    expect(limpiarTitulo('Mi | Mimo', null, 'www.mimo.com.ar')).toBe('Mi | Mimo')
  })

  test('el texto: entidades, espacios raros, tags, y las mayúsculas como vienen', () => {
    expect(limpiarTitulo('Mate\u00a0imperial\u200b  de calabaza', null, 'x.com')).toBe('Mate imperial de calabaza')
    expect(limpiarTitulo('REMERA &amp;amp; SHORT', null, 'x.com')).toBe('REMERA & SHORT')
    expect(limpiarTitulo('Caf&eacute; &#233; &#xe9; <b>molido</b>', null, 'x.com')).toBe('Café é é molido')
    expect(limpiarTitulo('BIOPAUSIA', null, 'www.yenny-elateneo.com')).toBe('BIOPAUSIA')
    expect(limpiarTitulo('   ', null, 'x.com')).toBeNull()
    // lo que Object.prototype tiene no es una entidad: quedan como están
    for (const e of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
      expect(limpiarTitulo(`Mate &${e}; imperial`, null, 'x.com'), e).toBe(`Mate &${e}; imperial`)
    }
  })

  test('de hasta 120 caracteres, cortado en una palabra', () => {
    const largo = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ') // unos 360
    const t = limpiarTitulo(largo, null, 'x.com')!
    expect(t.length).toBeLessThanOrEqual(120)
    expect(largo.startsWith(t)).toBe(true)
    expect(largo[t.length]).toBe(' ')
    // sin espacios después del 60, se corta en el 120
    expect(limpiarTitulo('x'.repeat(200), null, 'x.com')).toBe('x'.repeat(120))
    // si el 121 es un espacio, entran los 120 justos
    const justo = `${'x'.repeat(70)} ${'y'.repeat(49)}`
    expect(limpiarTitulo(`${justo} zzz`, null, 'x.com')).toBe(justo)
  })
})

test('fotoGrande: ML, VTEX y Tiendanube; el resto queda igual', () => {
  for (const c of ['mercadolibre-1', 'mercadolibre-3']) {
    const e = fixture(c).expected
    expect(fotoGrande(e.image!), c).toBe(e.imageHiRes)
  }
  expect(fotoGrande(fixture('oncity-1').expected.image!)).toBe('https://aremsaprod.vtexassets.com/arquivos/ids/1295066-1000-1000/158039_01.jpg?v=639159340704870000')
  expect(fotoGrande('https://x.vteximg.com.br/arquivos/ids/55-300-300/a.jpg')).toBe('https://x.vteximg.com.br/arquivos/ids/55-1000-1000/a.jpg')
  expect(fotoGrande(fixture('yenny-1').expected.image!)).toMatch(/^https:\/\/acdn-us\.mitiendanube\.com\/stores\/004\/088\/117\/products\/731828-[0-9a-f]+-1024-1024\.webp$/)
  for (const igual of [
    fixture('crocs-1').expected.image!, fixture('puma-1').expected.image!, 'https://http2.mlstatic.com/otra-cosa.png',
    'https://mlstatic.com.otro.com/D_NQ_NP_1-O.webp', 'no es una url',
  ]) expect(fotoGrande(igual)).toBe(igual)
})

describe('muros', () => {
  test('por la URL', () => {
    for (const si of [
      'https://www.mercadolibre.com.ar/gz/account-verification?go=https%3A%2F%2Farticulo.mercadolibre.com.ar%2FMLA-1-_JM',
      'https://us.shein.com/risk/challenge?captcha_type=909', 'https://us.shein.com/risk/action/limit?risk-id=1',
      'https://www.google.com/sorry/index?continue=https://www.youtube.com/watch', 'https://www.aliexpress.com/_____tmd_____/punish?x=1',
    ]) expect(esUrlDeMuro(si), si).toBe(true)
    for (const no of [
      'https://articulo.mercadolibre.com.ar/MLA-1-mate-_JM', 'https://www.tienda.com/p?volver=google.com/sorry',
      'https://www.google.com.ar/search?q=sorry', 'no es una url',
    ]) expect(esUrlDeMuro(no), no).toBe(false)
  })

  test('por lo que dice la página, en los primeros 300 KB', () => {
    for (const firma of [
      'suspicious-traffic-frontend', '_____tmd_____/punish', 'bm-verify', 'sec-if-cpt', 'captcha-delivery.com',
      'Attention Required! | Cloudflare', '<title>Just a moment...</title>', 'cf-chl-', 'api-services-support@amazon.com',
      'validateCaptcha', 'unable to give you access', '<TITLE>Access Denied</TITLE>',
    ]) {
      expect(esPaginaBloqueada(`<html><head>${firma}</head></html>`, 'https://x.com/p'), firma).toBe(true)
      expect(leerProducto(`<title>Algo</title><meta property="og:type" content="product">${firma}`, 'https://x.com/p').estado, firma).toBe('bloqueado')
    }
    // un producto que más abajo (pasados los 300 KB) muestra un captcha en las reseñas sigue siendo un producto
    const producto = `<meta property="og:type" content="product"><meta property="og:title" content="Mate">${' '.repeat(300_000)}captcha-delivery.com`
    expect(esPaginaBloqueada(producto, 'https://x.com/p')).toBe(false)
    expect(leerProducto(producto, 'https://x.com/p')).toMatchObject({ estado: 'ok', producto: { titulo: 'Mate' } })
  })
})

describe('leerProducto con HTML armado', () => {
  const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`

  test('sin señal de producto, sin-datos; una "cosa" da nombre y foto', () => {
    expect(leerProducto('<meta property="og:type" content="website"><meta property="og:title" content="Frávega">', 'https://www.fravega.com/p/x/').estado).toBe('sin-datos')
    expect(leerProducto('<meta property="og:type" content="product.group"><meta property="og:title" content="Billy">', 'https://www.ikea.com/cat/x/').estado).toBe('sin-datos')
    expect(leerProducto('<meta property="og:type" content="product"><meta property="og:title" content="Home">', 'https://x.com/').estado).toBe('sin-datos')
    expect(leerProducto(ld({ '@type': 'Event', name: 'Clase de tango', image: 'https://x.com/t.jpg' }), 'https://x.com/e/1'))
      .toEqual({ estado: 'ok', producto: { titulo: 'Clase de tango', precio: null, foto: 'https://x.com/t.jpg' } })
    expect(leerProducto(ld({ '@type': 'VideoObject', name: 'Un video' }) + ld({ '@type': 'Organization', name: 'X' }), 'https://x.com/v').estado).toBe('sin-datos')
  })

  test('una "cosa" con offers trae su precio (la entrada de un recital); sin offers, no', () => {
    const recital = { '@type': 'Event', name: 'Recital de Fito', image: 'https://x.com/f.jpg' }
    expect(leerProducto(ld({ ...recital, offers: { price: 25000, priceCurrency: 'ARS' } }), 'https://www.entradas.com.ar/e/1'))
      .toEqual({ estado: 'ok', producto: { titulo: 'Recital de Fito', precio: '$25.000', foto: 'https://x.com/f.jpg' } })
    // sin offers ni señal de producto, el precio no sale de las meta (itemprop=price no es una señal)
    expect(leerProducto(ld(recital) + '<meta itemprop="price" content="9000">', 'https://www.entradas.com.ar/e/1'))
      .toMatchObject({ estado: 'ok', producto: { precio: null } })
  })

  test('las entidades de la foto: &constructor; no es una', () => {
    const og = '<meta property="og:type" content="product"><meta property="og:title" content="Mate">'
    expect(leerProducto(`${og}<meta property="og:image" content="https://cdn.x.com/a.jpg?x=1&toString;&amp;y=2">`, 'https://x.com/p'))
      .toMatchObject({ producto: { foto: 'https://cdn.x.com/a.jpg?x=1&toString;&y=2' } })
  })

  test('la foto: //, relativa, http, null o de la red interna sigue con la siguiente', () => {
    const pagina = (image: unknown, og = '') => ld({ '@type': 'Product', name: 'Mate', image }) + og
    expect(leerProducto(pagina('//cdn.x.com/a.jpg'), 'https://x.com/p')).toMatchObject({ producto: { foto: 'https://cdn.x.com/a.jpg' } })
    expect(leerProducto(pagina('/img/a.jpg'), 'https://x.com/p/1')).toMatchObject({ producto: { foto: 'https://x.com/img/a.jpg' } })
    expect(leerProducto(pagina('http://cdn.x.com/a.jpg'), 'https://x.com/p')).toMatchObject({ producto: { foto: 'https://cdn.x.com/a.jpg' } })
    expect(leerProducto(pagina([null, '', { url: 'https://cdn.x.com/b.jpg' }]), 'https://x.com/p')).toMatchObject({ producto: { foto: 'https://cdn.x.com/b.jpg' } })
    expect(leerProducto(pagina('https://10.0.0.1/a.jpg', '<meta property="og:image" content="https://cdn.x.com/og.jpg">'), 'https://x.com/p'))
      .toMatchObject({ producto: { foto: 'https://cdn.x.com/og.jpg' } })
    expect(leerProducto(pagina(`https://cdn.x.com/${'a'.repeat(2000)}.jpg`), 'https://x.com/p')).toMatchObject({ producto: { foto: null } })
  })

  test('el precio: con stock primero, variantes, y la moneda de la oferta', () => {
    const p = (o: object) => leerProducto(ld({ '@type': 'Product', name: 'Mate', ...o }), 'https://www.tienda.com.ar/mate')
    expect(p({ offers: [{ price: 100, availability: 'https://schema.org/OutOfStock' }, { price: 200, availability: 'InStock' }] })).toMatchObject({ producto: { precio: '$200' } })
    expect(p({ offers: { '@type': 'AggregateOffer', lowPrice: '1.500', priceCurrency: 'ARS' } })).toMatchObject({ producto: { precio: '$1.500' } })
    expect(p({ offers: { priceSpecification: { price: 300, priceCurrency: 'USD' } } })).toMatchObject({ producto: { precio: 'US$ 300' } })
    expect(p({ '@type': 'ProductGroup', hasVariant: [{ offers: { price: '29.9', priceCurrency: 'USD' } }] })).toMatchObject({ producto: { precio: 'US$ 29,90' } })
    expect(p({ offers: { price: 300, priceCurrency: 'MXN' } })).toMatchObject({ producto: { precio: null } })
  })

  test('HTML hostil: JSON-LD roto, enorme o muy anidado no rompe nada', () => {
    let anidado: unknown = { '@type': 'Product', name: 'Hondo' }
    for (let i = 0; i < 50; i++) anidado = { '@graph': [anidado] }
    const hostil = '<script type="application/ld+json">{roto</script>' + ld(anidado) +
      `<script type="application/ld+json">${'['.repeat(100_000)}</script>` + '<meta property="og:type" content="product"><meta property="og:title" content="Sigue">'
    expect(leerProducto(hostil, 'https://x.com/p')).toMatchObject({ estado: 'ok', producto: { titulo: 'Sigue' } })
  })

  test('un availability que no es texto no rompe la lectura (ni la de la página entera)', async () => {
    for (const availability of [{ toString: 1 }, { toString: 'x', valueOf: 'y' }, [{ toString: 1, valueOf: 1 }]]) {
      const html = ld({ '@type': 'Product', name: 'Mate', offers: { price: '10', priceCurrency: 'ARS', availability } })
      expect(leerProducto(html, 'https://x.com.ar/p')).toEqual({ estado: 'ok', producto: { titulo: 'Mate', precio: '$10', foto: null } })
      const s = servidor({ 'https://x.com.ar/p': { headers: { 'content-type': 'text/html' }, cuerpo: html } })
      expect((await leerPagina('https://x.com.ar/p', s.pedir)).estado).toBe('ok')
    }
  })

  test('si algo de la lectura tira, sin-datos: nunca una excepción para quien llama', () => {
    // algo de adentro que tira (acá, normalize, que usa la limpieza del título)
    const tira = vi.spyOn(String.prototype, 'normalize').mockImplementation(() => { throw new TypeError('roto') })
    try {
      expect(leerProducto('<meta property="og:type" content="product"><meta property="og:title" content="Mate - Tienda">', 'https://www.tienda.com/p'))
        .toEqual({ estado: 'sin-datos' })
    } finally {
      tira.mockRestore()
    }
  })

  test('un @type enorme o miles de nodos: con topes, y cada tipo se mira una vez', () => {
    // 4 bloques de casi 1 MB cada uno (el tope de un bloque): armar los tipos en cada pregunta eran segundos
    const pagina = (tipo: unknown) => ld({ '@type': 'WebPage', mainEntity: { '@type': tipo, name: 'x' } }).repeat(4)
    for (const [que, tipo] of [['333 mil tipos vacíos', Array(333_000).fill('')], ['un tipo de 980 mil "/"', '/'.repeat(980_000)]] as const) {
      const html = pagina(tipo)
      expect(html.length, que).toBeGreaterThan(3_900_000)
      const antes = Date.now()
      expect(leerProducto(html, 'https://x.com/p').estado, que).toBe('sin-datos')
      expect(Date.now() - antes, que).toBeLessThan(1000)
    }
    // 50 mil nodos por bloque, en arrays anidados: se miran los primeros
    const anidados = ld(Array(100).fill(Array(100).fill(Array(5).fill({ '@type': 'Thing' })))).repeat(4)
    expect(anidados.length).toBeGreaterThan(3_600_000)
    const antes = Date.now()
    expect(leerProducto(anidados, 'https://x.com/p').estado).toBe('sin-datos')
    expect(Date.now() - antes).toBeLessThan(1000)
    // un tipo con su URL adelante sigue contando
    expect(leerProducto(ld({ '@type': ['', 'https://schema.org/Product'], name: 'Mate' }), 'https://x.com/p')).toMatchObject({ estado: 'ok', producto: { titulo: 'Mate' } })
  })

  test('HTML armado para que una regex tarde: ninguna recorre la página más de una vez', () => {
    // 4 MB (lo más que se baja) de lo mismo: con una regex que vuelve atrás, cada repetición recorría el resto
    const cuatroMB = (s: string) => s.repeat(Math.ceil(4_000_000 / s.length))
    for (const [que, hostil] of [
      ['un meta enorme y un <title> sin cerrar', `<meta ${'a='.repeat(200_000)}><title>${'<'.repeat(100_000)}`],
      ['miles de JSON-LD sin </script>', '<script type="application/ld+json">'.repeat(100_000)],
      ['miles de __STATE__ sin </script>', '<template data-varname="__STATE__"><script>'.repeat(80_000)],
      ['un name que es todo "<"', `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: '<'.repeat(1_000_000) })}</script>`],
      ['atributos sin cerrar', `<meta property="og:title" content="${'x '.repeat(500_000)}`],
      ['muchos data-large_image', `<meta property="og:type" content="product">${'<img data-large_image="x'.repeat(100_000)}`],
      // tags que nunca cierran con ">"
      ['<meta sin ">"', cuatroMB('<meta ')],
      ['<title sin ">"', cuatroMB('<title ')],
      ['<link rel=canonical sin ">"', cuatroMB('<link rel=canonical ')],
      ['<script ld+json sin ">"', cuatroMB('<script type=application/ld+json ')],
      ['<template __STATE__ sin ">"', cuatroMB('<template data-varname=__STATE__ ')],
      ['<template __STATE__ y un <script sin ">"', cuatroMB('<template data-varname=__STATE__><script ')],
      ['<template __STATE__ sin <script', cuatroMB('<template data-varname=__STATE__>x')],
      ['<title> sin </title>', cuatroMB('<title>x')],
    ] as const) {
      const antes = Date.now()
      leerProducto(hostil, 'https://x.com/p')
      expect(Date.now() - antes, que).toBeLessThan(1000)
    }
  })
})
