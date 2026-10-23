import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { deseoDesdeForm } from '@/lib/deseo-form'
import {
  AVISO_MUCHOS, avisoBuscando, completador, ESPERA_ESCRITO_MS, LEER_LINK_MS, linkParaCompletar, loDelAnterior, queCompletar,
  respuestaLink, type Contestado, type Puesto, type RespuestaLink, type Valores,
} from '@/lib/completar-deseo'
import { DeseoForm } from '@/components/DeseoForm'

// Completar el deseo desde el link del producto, en el navegador: qué link se busca, qué se escribe sin pisar lo del
// dueño, qué se avisa y cuándo se pide. Sin DOM: el formulario es un objeto con los tres campos.

const ML = 'https://articulo.mercadolibre.com.ar/MLA-123456-mate-imperial-_JM'
const OTRO = 'https://articulo.mercadolibre.com.ar/MLA-222-termo-stanley-_JM'
const FOTO = 'https://http2.mlstatic.com/D_123-MLA456-O.jpg'

const valores = (v: Partial<Valores> = {}): Valores => ({ titulo: '', linkTienda: '', precio: '', ...v })
const ok = (r: Partial<RespuestaLink> = {}): RespuestaLink => ({
  estado: 'ok', titulo: 'Mate imperial de calabaza', precio: '$88.990', foto: FOTO, sitio: 'mercadolibre.com.ar', ...r,
})
const fd = (campos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}

describe('linkParaCompletar', () => {
  test('pide el mismo link que el servidor pasaría a "Link a la tienda" (las filas de formularios.test.ts)', () => {
    const filas: [string, string][] = [
      [ML, ''], [`Mate imperial ${ML}`, ''], ['www.zara.com/ar/campera', ''], [ML, ML], [`Mate ${ML}`, ML.replace('https://', '')],
      // con otro link a la tienda, el del título se queda en el título: se busca el de la tienda
      [ML, 'https://otra.com/x'], [`Mate ${ML}`, 'otra.com/x'],
      // algo que no es link a la tienda (al editar, conserva el guardado): el del título se queda, y no se busca nada
      [ML, '@lacasadelmate'], ['Mate', 'zara campera'],
      ['Zara.com gift card', ''], ['Mate', ''], ['Mate', 'www.zara.com/x'], ['www.', ''], ['   ', ''],
      ['Mate, https://a.com/m, el negro', ''], ['Quiero este: https://tienda.com/x.', ''], ['Remera (ver www.zara.com/ar)', ''],
      ['Mirá https://a.com/x!', ''], ['Mate https://es.wikipedia.org/wiki/Mate_(infusión)', ''],
      ['(Mate https://es.wikipedia.org/wiki/Mate_(infusión)).', ''], ['Termo https://tienda.com/x?ref=', ''], ['Mate https://a.com/x…', ''],
      ['Mirá ‘https://a.com/x’', ''], ['Ver [https://x.com/a]', ''], ['Mate <https://x.com/a>', ''], ['Ver https://x.com/a?f[0]=1', ''],
    ]
    for (const [titulo, linkTienda] of filas) {
      const servidor = deseoDesdeForm(fd({ titulo: titulo.trim() ? titulo : 'x', linkTienda }))!.linkTienda
      const esperado = titulo.trim() && typeof servidor === 'string' ? servidor : null
      expect(linkParaCompletar(valores({ titulo, linkTienda }), null), `${titulo} | ${linkTienda}`).toBe(esperado)
    }
  })

  test('al editar, el link guardado no se busca (al abrir la pantalla no se pide nada); uno nuevo sí', () => {
    const guardado = 'https://www.zara.com/ar/campera-1234.html'
    expect(linkParaCompletar(valores({ titulo: 'Campera', linkTienda: guardado }), guardado)).toBeNull()
    expect(linkParaCompletar(valores({ titulo: 'Campera', linkTienda: guardado.replace('https://', '') }), guardado)).toBeNull()
    expect(linkParaCompletar(valores({ titulo: 'Campera', linkTienda: ML }), guardado)).toBe(ML)
    // un link pegado en el título con el guardado a la tienda se queda en el título (ver deseoDesdeForm)
    expect(linkParaCompletar(valores({ titulo: ML, linkTienda: guardado }), guardado)).toBeNull()
    // si borró el guardado y pegó otro en el título, ese
    expect(linkParaCompletar(valores({ titulo: ML, linkTienda: '' }), guardado)).toBe(ML)
  })

  test('lo que el servidor no va a buscar no se pide: localhost, una IP, otro puerto, nombres internos', () => {
    for (const l of ['https://localhost/x', 'https://10.0.0.1/x', 'https://tienda.com:8443/x', 'https://db.internal/x', 'https://[::1]/x']) {
      expect(linkParaCompletar(valores({ titulo: l }), null), l).toBeNull()
      expect(linkParaCompletar(valores({ linkTienda: l }), null), l).toBeNull()
    }
    // http:// sí (el servidor lo pide por https), tal como está escrito
    expect(linkParaCompletar(valores({ titulo: 'http://tienda.com.ar/x' }), null)).toBe('http://tienda.com.ar/x')
  })

  test('el link a la tienda que puso el autocompletado cuenta como vacío: otro link pegado en el título lo reemplaza', () => {
    const puesto: Puesto = { link: ML, titulo: 'Mate imperial', linkTienda: ML }
    expect(linkParaCompletar(valores({ titulo: OTRO, linkTienda: ML }), null, puesto)).toBe(OTRO)
    // sin puesto (lo escribió el dueño), el del título se queda: se busca el de la tienda
    expect(linkParaCompletar(valores({ titulo: OTRO, linkTienda: ML }), null)).toBe(ML)
  })
})

describe('queCompletar', () => {
  test('lo vacío se llena: el link del título pasa a la tienda, con el nombre, el precio y la foto', () => {
    expect(queCompletar(valores({ titulo: ML }), ML, ok(), null)).toEqual({
      titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990', foto: FOTO,
      aviso: 'Completamos el nombre y el precio desde mercadolibre.com.ar. Revisalos.',
      puesto: { link: ML, titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' },
    })
    // desde "Link a la tienda", con el título vacío
    expect(queCompletar(valores({ linkTienda: ML }), ML, ok(), null)).toMatchObject({ titulo: 'Mate imperial de calabaza', precio: '$88.990' })
  })

  test('lo escrito no se pisa, y el aviso nombra solo lo que llenó (si no llenó nada, ninguno)', () => {
    const c = queCompletar(valores({ titulo: 'Mate', linkTienda: ML, precio: '$1' }), ML, ok(), null)!
    expect(c).toEqual({ foto: FOTO, aviso: null, puesto: { link: ML } })
    expect(queCompletar(valores({ titulo: 'Mate', linkTienda: ML }), ML, ok(), null)).toMatchObject({
      precio: '$88.990', aviso: 'Completamos el precio desde mercadolibre.com.ar. Revisalo.',
    })
    const sinPrecio = queCompletar(valores({ titulo: ML, precio: '$1' }), ML, ok(), null)!
    expect(sinPrecio.precio).toBeUndefined()
    expect(sinPrecio.aviso).toBe('Completamos el nombre desde mercadolibre.com.ar. Revisalo.')
    // un precio en otra moneda viene null y no se pone
    expect(queCompletar(valores({ titulo: ML }), ML, ok({ precio: null }), null)!.precio).toBeUndefined()
  })

  test('con texto y link en el título queda el texto (sin el nombre) y el link pasa a la tienda', () => {
    const c = queCompletar(valores({ titulo: `Para mamá ${ML}` }), ML, ok(), null)!
    expect(c).toMatchObject({ titulo: 'Para mamá', linkTienda: ML, precio: '$88.990' })
    expect(c.puesto.titulo).toBeUndefined()
    expect(c.aviso).toBe('Completamos el precio desde mercadolibre.com.ar. Revisalo.')
  })

  test('sin nombre, si era solo el link, queda el link (el servidor pone el del link o el sitio)', () => {
    const c = queCompletar(valores({ titulo: 'https://tienda.com.ar/x' }), 'https://tienda.com.ar/x', ok({ titulo: null, precio: null }), null)!
    expect(c.titulo).toBeUndefined()
    expect(c.linkTienda).toBe('https://tienda.com.ar/x')
    expect(c.aviso).toBeNull()
  })

  test('lo que puso el primer link se reemplaza con el segundo; lo que corrigió el dueño, no', () => {
    const primero = queCompletar(valores({ titulo: ML }), ML, ok(), null)!
    const despues = valores({ titulo: primero.titulo, linkTienda: primero.linkTienda, precio: primero.precio })
    const segundo = ok({ titulo: 'Termo Stanley 1 litro', precio: '$120.000', foto: 'https://http2.mlstatic.com/D_9-O.jpg' })
    // otro link a la tienda
    expect(queCompletar({ ...despues, linkTienda: OTRO }, OTRO, segundo, primero.puesto)).toMatchObject({
      titulo: 'Termo Stanley 1 litro', precio: '$120.000', foto: segundo.foto,
    })
    // otro link pegado en el título: también reemplaza el link a la tienda que puso el primero
    expect(queCompletar({ ...despues, titulo: OTRO }, OTRO, segundo, primero.puesto)).toMatchObject({
      titulo: 'Termo Stanley 1 litro', linkTienda: OTRO, precio: '$120.000',
    })
    // pegado al lado del nombre que puso el primero: ese nombre no es del dueño
    expect(queCompletar({ ...despues, titulo: `${primero.titulo} ${OTRO}` }, OTRO, segundo, primero.puesto)!.titulo).toBe('Termo Stanley 1 litro')
    // corregido a mano: queda
    const corregido = queCompletar({ ...despues, titulo: 'Mate de mamá', precio: '$90.000', linkTienda: OTRO }, OTRO, segundo, primero.puesto)!
    expect(corregido.titulo).toBeUndefined()
    expect(corregido.precio).toBeUndefined()
    expect(corregido.aviso).toBeNull()
  })

  test('lo que puso el primer link y el segundo no trae se vacía: no es de este producto', () => {
    const primero = queCompletar(valores({ titulo: ML }), ML, ok(), null)!
    const despues = valores({ titulo: primero.titulo, linkTienda: OTRO, precio: primero.precio })
    const c = queCompletar(despues, OTRO, { estado: 'bloqueado', titulo: null, precio: null, foto: null, sitio: 'otra.com' }, primero.puesto)!
    expect(c).toMatchObject({ titulo: '', precio: '', foto: null })
    expect(c.puesto).toEqual({ link: OTRO })
  })

  test('un bloqueado de MercadoLibre aplica el nombre del link y dice cómo poner la foto', () => {
    const r: RespuestaLink = { estado: 'bloqueado', titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' }
    expect(queCompletar(valores({ titulo: ML }), ML, r, null)).toMatchObject({
      titulo: 'Mate imperial', linkTienda: ML, foto: null,
      aviso: 'MercadoLibre no nos deja ver la publicación. Pusimos el nombre del link: revisalo. Para la foto, copiala desde la app y tocá Pegar.',
    })
    // con el nombre escrito por el dueño no dice que lo puso
    expect(queCompletar(valores({ titulo: 'Mate', linkTienda: ML }), ML, r, null)!.aviso)
      .toBe('MercadoLibre no nos deja ver la publicación. Para la foto, copiala desde la app y tocá Pegar.')
    expect(queCompletar(valores({ titulo: 'Remera', linkTienda: 'https://www.zara.com/ar/x' }), 'https://www.zara.com/ar/x',
      { estado: 'bloqueado', titulo: null, precio: null, foto: null, sitio: 'zara.com' }, null)!.aviso)
      .toBe('zara.com no nos deja ver la página. Completá lo que falte.')
  })

  test('los otros fallos: su aviso, y el nombre del link si el título era solo el link', () => {
    const fallo = (estado: RespuestaLink['estado']): RespuestaLink => ({ estado, titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' })
    const avisos: [Contestado, string][] = [
      [fallo('sin-datos'), 'No encontramos los datos del producto en esa página. Completá lo que falte.'],
      [fallo('no-esta'), 'Esa publicación ya no existe. Fijate que el link sea el de ahora.'],
      [fallo('no-carga'), 'No pudimos abrir esa página. Completá lo que falte.'],
      // no contestó a tiempo o sin red, y el tope: el nombre lo saca el navegador del link
      [null, 'No pudimos abrir esa página. Completá lo que falte.'],
      ['muchos', AVISO_MUCHOS],
    ]
    for (const [r, aviso] of avisos) {
      expect(queCompletar(valores({ titulo: ML }), ML, r, null), String(r && typeof r === 'object' ? r.estado : r))
        .toMatchObject({ titulo: 'Mate imperial', linkTienda: ML, aviso })
    }
    expect(queCompletar(valores({ titulo: 'Remera', linkTienda: ML }), ML, null, null)!.titulo).toBeUndefined()
  })

  test('un precio escrito se respeta; con otro link en la tienda no se mueve nada', () => {
    expect(queCompletar(valores({ titulo: ML, precio: '$50.000' }), ML, ok(), null)!.precio).toBeUndefined()
    const conOtro = valores({ titulo: ML, linkTienda: 'https://otra.com/x' })
    // el link a completar es el de la tienda: la respuesta del del título no se aplica
    expect(queCompletar(conOtro, ML, ok(), null)).toBeNull()
    const c = queCompletar(conOtro, 'https://otra.com/x', ok({ sitio: 'otra.com' }), null)!
    expect(c.titulo).toBeUndefined()
    expect(c.linkTienda).toBeUndefined()
  })

  test('la respuesta de un link que ya no está (lo borró o pegó otro) no se aplica', () => {
    expect(queCompletar(valores({ titulo: 'Mate' }), ML, ok(), null)).toBeNull()
    expect(queCompletar(valores({ titulo: OTRO }), ML, ok(), null)).toBeNull()
    expect(queCompletar(valores({ linkTienda: OTRO }), ML, ok(), null)).toBeNull()
  })

  test('una foto que no es https pública no se propone', () => {
    for (const foto of ['http://x.com/a.jpg', 'https://localhost/a.jpg', 'javascript:alert(1)', '/foto/deseo/x']) {
      expect(queCompletar(valores({ titulo: ML }), ML, ok({ foto }), null)!.foto, foto).toBeNull()
    }
  })
})

test('al buscar otro link, lo que puso el anterior y nadie tocó se saca enseguida', () => {
  const puesto: Puesto = { link: ML, titulo: 'Mate imperial', linkTienda: ML, precio: '$88.990' }
  expect(loDelAnterior(valores({ titulo: OTRO }), OTRO, null)).toBeNull()
  expect(loDelAnterior(valores({ titulo: ML }), ML, puesto)).toBeNull()
  expect(loDelAnterior(valores({ titulo: OTRO, linkTienda: ML, precio: '$88.990' }), OTRO, puesto)).toEqual({ linkTienda: '', precio: '', foto: null })
  expect(loDelAnterior(valores({ titulo: 'Mate imperial', linkTienda: OTRO, precio: '$1' }), OTRO, puesto)).toEqual({ titulo: '', foto: null })
})

test('la respuesta del servidor se toma solo con la forma de RespuestaLink', () => {
  expect(respuestaLink(ok())).toEqual(ok())
  expect(respuestaLink({ ...ok(), html: '<html>' })).toEqual(ok())
  for (const x of [null, 'ok', [], { ...ok(), estado: 'raro' }, { ...ok(), titulo: 3 }, { ...ok(), sitio: null }, { ...ok(), foto: {} }]) {
    expect(respuestaLink(x), JSON.stringify(x)).toBeNull()
  }
})

describe('completador: cuándo se pide', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /** El formulario de mentira: los tres campos, la línea de estado, las fotos propuestas y los pedidos sin contestar. */
  function armar(inicial: Partial<Valores> = {}, guardado: string | null = null) {
    const v = valores(inicial)
    const fotos: (string | null)[] = []
    const linea = { texto: '' }
    const pedidos: { link: string; signal: AbortSignal; contestar: (r: Contestado | undefined) => void }[] = []
    const pedir = vi.fn((link: string, signal: AbortSignal) => new Promise<Contestado | undefined>((contestar, fallar) => {
      pedidos.push({ link, signal, contestar })
      signal.addEventListener('abort', () => fallar(new Error('cortado')))
    }))
    const c = completador({
      guardado, pedir, leer: () => ({ ...v }), mostrar: (t) => { linea.texto = t },
      escribir: (campos, foto) => {
        for (const k of ['titulo', 'linkTienda', 'precio'] as const) if (campos[k] !== undefined) v[k] = campos[k]
        if (foto !== undefined) fotos.push(foto)
      },
    })
    const cambiar = (campo: keyof Valores, valor: string, pegado = false) => {
      v[campo] = valor
      c.alCambiar(pegado)
    }
    return { v, fotos, linea, pedidos, pedir, cambiar, cerrar: c.cerrar }
  }

  test('un pegado se pide en el momento y completa al volver; mientras, la línea dice dónde busca', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    expect(f.pedidos.map((p) => p.link)).toEqual([ML])
    expect(f.linea.texto).toBe(avisoBuscando(ML))
    expect(f.linea.texto).toBe('Buscando el producto en mercadolibre.com.ar…')
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })
    expect(f.fotos).toEqual([FOTO])
    expect(f.linea.texto).toBe('Completamos el nombre y el precio desde mercadolibre.com.ar. Revisalos.')
    // seguir escribiendo en el título no vuelve a pedir
    f.cambiar('titulo', 'Mate imperial de calabaza grande')
    await vi.advanceTimersByTimeAsync(ESPERA_ESCRITO_MS * 2)
    expect(f.pedir).toHaveBeenCalledTimes(1)
  })

  test('lo escrito a mano espera 400 ms sin cambios', async () => {
    const f = armar()
    f.cambiar('linkTienda', 'tienda.com.ar/producto/mate-de-calabaza')
    await vi.advanceTimersByTimeAsync(ESPERA_ESCRITO_MS - 50)
    f.cambiar('linkTienda', 'tienda.com.ar/producto/mate-de-calabaza-grande')
    await vi.advanceTimersByTimeAsync(ESPERA_ESCRITO_MS - 50)
    expect(f.pedir).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(f.pedidos.map((p) => p.link)).toEqual(['https://tienda.com.ar/producto/mate-de-calabaza-grande'])
  })

  test('el mismo link pegado de nuevo no se pide otra vez (se completa con lo leído), salvo que no haya cargado', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    f.cambiar('titulo', '')
    f.cambiar('linkTienda', '')
    expect(f.linea.texto).toBe('')
    f.cambiar('titulo', ML, true)
    expect(f.pedir).toHaveBeenCalledTimes(1)
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })

    // uno que no cargó se vuelve a pedir si se pega de nuevo (sin reintentos solos)
    f.cambiar('titulo', OTRO, true)
    f.pedidos[1].contestar({ estado: 'no-carga', titulo: 'Termo stanley', precio: null, foto: null, sitio: 'mercadolibre.com.ar' })
    await vi.advanceTimersByTimeAsync(LEER_LINK_MS)
    expect(f.pedir).toHaveBeenCalledTimes(2)
    f.cambiar('titulo', OTRO, true)
    expect(f.pedidos.map((p) => p.link)).toEqual([ML, OTRO, OTRO])
  })

  test('un link nuevo corta el pedido anterior, y lo que llega de ese se descarta', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    f.cambiar('titulo', OTRO, true)
    expect(f.pedidos[0].signal.aborted).toBe(true)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v.titulo).toBe(OTRO)
    f.pedidos[1].contestar(ok({ titulo: 'Termo Stanley' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toMatchObject({ titulo: 'Termo Stanley', linkTienda: OTRO })
  })

  test('si lo borra mientras busca, se corta y se limpia la línea', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    f.cambiar('titulo', 'Mate')
    expect(f.pedidos[0].signal.aborted).toBe(true)
    expect(f.linea.texto).toBe('')
    await vi.advanceTimersByTimeAsync(LEER_LINK_MS)
    expect(f.v).toEqual(valores({ titulo: 'Mate' }))
  })

  test('a los 9 s se corta: no cargó, con el nombre del link', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    await vi.advanceTimersByTimeAsync(LEER_LINK_MS - 1)
    expect(f.pedidos[0].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.pedidos[0].signal.aborted).toBe(true)
    expect(f.v).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
    expect(f.linea.texto).toBe('No pudimos abrir esa página. Completá lo que falte.')
  })

  test('sin sesión o un link que el servidor no toma: no se escribe ni se avisa nada', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    f.pedidos[0].contestar(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual(valores({ titulo: ML }))
    expect(f.linea.texto).toBe('')
    expect(f.fotos).toEqual([])
  })

  test('el tope por usuario: su aviso, y el nombre del link', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    f.pedidos[0].contestar('muchos')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
    expect(f.linea.texto).toBe(AVISO_MUCHOS)
  })

  test('al editar no se pide nada hasta que cambie el link guardado', async () => {
    const guardado = 'https://www.zara.com/ar/campera-1234.html'
    const f = armar({ titulo: 'Campera', linkTienda: guardado, precio: '$50.000' }, guardado)
    f.cambiar('titulo', 'Campera negra')
    await vi.advanceTimersByTimeAsync(ESPERA_ESCRITO_MS)
    expect(f.pedir).not.toHaveBeenCalled()
    f.cambiar('linkTienda', ML, true)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    // ya hay título y precio: solo la foto, que FotoField toma si no hay una
    expect(f.v).toEqual({ titulo: 'Campera negra', linkTienda: ML, precio: '$50.000' })
    expect(f.fotos).toEqual([FOTO])
  })

  test('con otro link, lo del anterior se saca apenas se pide (si manda antes, no se guarda con lo del otro)', async () => {
    const f = armar()
    f.cambiar('titulo', ML, true)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    f.cambiar('titulo', OTRO, true)
    // el título tiene el link nuevo y la tienda quedó vacía: el servidor movería este
    expect(f.v).toEqual(valores({ titulo: OTRO }))
    expect(f.fotos).toEqual([FOTO, null])
    expect(deseoDesdeForm(fd({ ...f.v }))).toMatchObject({ titulo: 'Termo stanley', linkTienda: OTRO, precio: null })
    f.pedidos[1].contestar(ok({ titulo: 'Termo Stanley', precio: '$120.000', foto: null }))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Termo Stanley', linkTienda: OTRO, precio: '$120.000' })
  })

  test('al cerrarse el formulario se corta lo que esté en curso', async () => {
    const f = armar()
    f.cambiar('linkTienda', ML)
    f.cerrar()
    await vi.advanceTimersByTimeAsync(ESPERA_ESCRITO_MS)
    expect(f.pedir).not.toHaveBeenCalled()
    f.cambiar('titulo', OTRO, true)
    f.cerrar()
    expect(f.pedidos[0].signal.aborted).toBe(true)
  })
})

test('el formulario lleva la línea de estado entre el título y la foto, vacía hasta que haya algo que decir', () => {
  const html = renderToStaticMarkup(createElement(DeseoForm, { action: async () => {}, boton: 'Agregar' }))
  const titulo = html.indexOf('name="titulo"')
  const estado = html.indexOf('<p role="status"')
  const foto = html.indexOf('name="fotoUrl"')
  expect(titulo).toBeGreaterThan(0)
  expect(estado).toBeGreaterThan(titulo)
  expect(foto).toBeGreaterThan(estado)
  expect(html).toMatch(/<p role="status" class="[^"]*"><\/p>/)
  expect(html).not.toContain('role="alert"')
})
