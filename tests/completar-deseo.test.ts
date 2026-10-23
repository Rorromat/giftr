import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { deseoDesdeForm } from '@/lib/deseo-form'
import {
  AVISO_MUCHOS, avisoBuscando, completador, CONSEJO_FOTO_ML, LEER_LINK_MS, linkParaCompletar, linksGuardados, loDelAnterior,
  loQueEntro, mismoProducto, queCompletar, respuestaLink, traeElLink, type Campo, type Contestado, type Destino, type Puesto,
  type RespuestaLink, type Valores,
} from '@/lib/completar-deseo'
import { queHacerConPropuesta } from '@/lib/foto-del-form'
import { DeseoForm } from '@/components/DeseoForm'
import { FotoField } from '@/components/FotoField'

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
      expect(linkParaCompletar(valores({ titulo, linkTienda }), []), `${titulo} | ${linkTienda}`).toBe(esperado)
    }
  })

  test('al editar, el link guardado no se busca (al abrir la pantalla no se pide nada); uno nuevo sí', () => {
    const guardado = 'https://www.zara.com/ar/campera-1234.html'
    expect(linkParaCompletar(valores({ titulo: 'Campera', linkTienda: guardado }), [guardado])).toBeNull()
    expect(linkParaCompletar(valores({ titulo: 'Campera', linkTienda: guardado.replace('https://', '') }), [guardado])).toBeNull()
    expect(linkParaCompletar(valores({ titulo: 'Campera', linkTienda: ML }), [guardado])).toBe(ML)
    // un link pegado en el título con el guardado a la tienda se queda en el título (ver deseoDesdeForm)
    expect(linkParaCompletar(valores({ titulo: ML, linkTienda: guardado }), [guardado])).toBeNull()
    // si borró el guardado y pegó otro en el título, ese
    expect(linkParaCompletar(valores({ titulo: ML, linkTienda: '' }), [guardado])).toBe(ML)
  })

  test('al editar, el link del título igual al guardado, o al que tenía el título al abrir, tampoco', () => {
    const guardado = 'https://www.zara.com/ar/campera-1234.html'
    // un deseo de antes con el link en el título y también a la tienda: corregir una letra del título pedía el guardado
    const conLosDos = linksGuardados(guardado, `Campera ${guardado}`)
    expect(conLosDos).toEqual([guardado, guardado])
    expect(linkParaCompletar(valores({ titulo: `Campera negra ${guardado}`, linkTienda: guardado }), conLosDos)).toBeNull()
    // uno con el link solo en el título (sin link a la tienda)
    const enElTitulo = linksGuardados(null, `Campera ${guardado}`)
    expect(enElTitulo).toEqual([guardado])
    expect(linkParaCompletar(valores({ titulo: `Campera negra ${guardado}` }), enElTitulo)).toBeNull()
    // otro link, sí
    expect(linkParaCompletar(valores({ titulo: `Campera negra ${ML}` }), enElTitulo)).toBe(ML)
    expect(linkParaCompletar(valores({ titulo: `Campera ${guardado}`, linkTienda: ML }), enElTitulo)).toBe(ML)
    expect(linksGuardados(null, 'Campera')).toEqual([])
  })

  test('lo que el servidor no va a buscar no se pide: localhost, una IP, otro puerto, nombres internos', () => {
    for (const l of ['https://localhost/x', 'https://10.0.0.1/x', 'https://tienda.com:8443/x', 'https://db.internal/x', 'https://[::1]/x']) {
      expect(linkParaCompletar(valores({ titulo: l }), []), l).toBeNull()
      expect(linkParaCompletar(valores({ linkTienda: l }), []), l).toBeNull()
    }
    // http:// sí (el servidor lo pide por https), tal como está escrito
    expect(linkParaCompletar(valores({ titulo: 'http://tienda.com.ar/x' }), [])).toBe('http://tienda.com.ar/x')
  })

  test('el link a la tienda que puso el autocompletado cuenta como vacío: otro link pegado en el título lo reemplaza', () => {
    const puesto: Puesto = { link: ML, titulo: 'Mate imperial', linkTienda: ML }
    expect(linkParaCompletar(valores({ titulo: OTRO, linkTienda: ML }), [], puesto)).toBe(OTRO)
    // sin puesto (lo escribió el dueño), el del título se queda: se busca el de la tienda
    expect(linkParaCompletar(valores({ titulo: OTRO, linkTienda: ML }), [])).toBe(ML)
  })
})

describe('queCompletar', () => {
  test('lo vacío se llena: el link del título pasa a la tienda, con el nombre, el precio y la foto', () => {
    expect(queCompletar(valores({ titulo: ML }), ML, ok(), null)).toEqual({
      titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990', foto: FOTO,
      aviso: 'Completamos nombre y precio: revisalos.',
      puesto: { link: ML, titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' },
    })
    // desde "Link a la tienda", con el título vacío
    expect(queCompletar(valores({ linkTienda: ML }), ML, ok(), null)).toMatchObject({ titulo: 'Mate imperial de calabaza', precio: '$88.990' })
  })

  test('lo escrito no se pisa, y el aviso nombra solo lo que llenó (si no llenó nada, ninguno)', () => {
    const c = queCompletar(valores({ titulo: 'Mate', linkTienda: ML, precio: '$1' }), ML, ok(), null)!
    expect(c).toEqual({ foto: FOTO, aviso: null, puesto: { link: ML } })
    expect(queCompletar(valores({ titulo: 'Mate', linkTienda: ML }), ML, ok(), null)).toMatchObject({
      precio: '$88.990', aviso: 'Completamos el precio: revisalo.',
    })
    const sinPrecio = queCompletar(valores({ titulo: ML, precio: '$1' }), ML, ok(), null)!
    expect(sinPrecio.precio).toBeUndefined()
    expect(sinPrecio.aviso).toBe('Completamos el nombre: revisalo.')
    // un precio en otra moneda viene null y no se pone
    expect(queCompletar(valores({ titulo: ML }), ML, ok({ precio: null }), null)!.precio).toBeUndefined()
  })

  test('con texto y link en el título queda el texto (sin el nombre) y el link pasa a la tienda', () => {
    const c = queCompletar(valores({ titulo: `Para mamá ${ML}` }), ML, ok(), null)!
    expect(c).toMatchObject({ titulo: 'Para mamá', linkTienda: ML, precio: '$88.990' })
    expect(c.puesto.titulo).toBeUndefined()
    expect(c.aviso).toBe('Completamos el precio: revisalo.')
  })

  test('con el dueño en el título, el título no se toca: el link pasa a la tienda, el precio se completa y al mandar sale del título', () => {
    // pegó el link y escribió " Para " justo cuando volvió: con el título reescrito quedaba "Para" y seguía "Paramamá"
    const v = valores({ titulo: `${ML} Para ` })
    const c = queCompletar(v, ML, ok(), null, 'titulo')!
    expect(c.titulo).toBeUndefined()
    expect(c).toMatchObject({ linkTienda: ML, precio: '$88.990', puesto: { link: ML, linkTienda: ML } })
    expect(c.aviso).toBe('Completamos el precio: revisalo.')
    expect(deseoDesdeForm(fd({ ...v, linkTienda: ML }))).toMatchObject({ titulo: 'Para', linkTienda: ML })
    // tampoco con el link solo, con un espacio atrás (va a escribir) o vacío: el nombre se pone al dejar el campo
    for (const titulo of [ML, `${ML} `, '']) {
      const d = queCompletar(valores({ titulo, linkTienda: titulo ? '' : ML }), ML, ok(), null, 'titulo')!
      expect(d.titulo, titulo).toBeUndefined()
      expect(d.precio, titulo).toBe('$88.990')
    }
    // lo que puso antes el autocompletado sigue siendo suyo (se cambia al dejar el título)
    const puesto: Puesto = { link: ML, titulo: 'Mate imperial' }
    expect(queCompletar(valores({ titulo: 'Mate imperial', linkTienda: ML }), ML, ok(), puesto, 'titulo')!.puesto.titulo).toBe('Mate imperial')
  })

  test('con el dueño en el precio o en la tienda, ese campo tampoco se toca, y queda dicho para escribirlo al dejarlo', () => {
    const c = queCompletar(valores({ linkTienda: ML }), ML, ok(), null, 'precio')!
    expect(c).toMatchObject({ titulo: 'Mate imperial de calabaza', retenidos: ['precio'], aviso: 'Completamos el nombre: revisalo.' })
    expect(c.precio).toBeUndefined()
    // el precio que había puesto el autocompletado sigue siendo suyo
    expect(queCompletar(valores({ linkTienda: ML, precio: '$1' }), ML, ok(), { link: ML, precio: '$1' }, 'precio')!.puesto.precio).toBe('$1')
    // el link del título que tiene que pasar a la tienda espera con el título: si no, no estaba en ningún lado
    const d = queCompletar(valores({ titulo: ML }), ML, ok(), null, 'linkTienda')!
    expect(d).toMatchObject({ precio: '$88.990', retenidos: ['titulo', 'linkTienda'] })
    expect(d.titulo).toBeUndefined()
    expect(d.linkTienda).toBeUndefined()
    // si ya está en la tienda (lo pegó ahí también), el título no espera
    expect(queCompletar(valores({ titulo: ML, linkTienda: ML }), ML, ok(), null, 'linkTienda')).toMatchObject({
      titulo: 'Mate imperial de calabaza', retenidos: ['linkTienda'],
    })
    expect(queCompletar(valores({ titulo: ML }), ML, ok(), null)!.retenidos).toBeUndefined()
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

  test('lo que puso el primer link y el segundo no trae se vacía: no es de este producto (el título, al del link)', () => {
    const primero = queCompletar(valores({ titulo: ML }), ML, ok(), null)!
    const despues = valores({ titulo: primero.titulo, linkTienda: OTRO, precio: primero.precio })
    const sinNada = ok({ titulo: null, precio: null, foto: null, sitio: 'otra.com' })
    const c = queCompletar(despues, OTRO, sinNada, primero.puesto)!
    // el título es obligatorio: vacío frenaba el envío. Va el nombre del link (o el sitio), como lo pone el servidor
    expect(c).toMatchObject({ titulo: 'Termo stanley', precio: '', foto: null })
    expect(c.puesto).toEqual({ link: OTRO, titulo: 'Termo stanley' })
    const zara = 'https://www.zara.com/ar/campera'
    expect(queCompletar({ ...despues, linkTienda: zara }, zara, sinNada, primero.puesto)!.titulo).toBe('zara.com')
  })

  test('una respuesta que no es ok no vacía nada ni propone foto: solo pone el nombre del link y avisa', () => {
    const puesto: Puesto = { link: ML, titulo: 'Mate imperial', linkTienda: ML, precio: '$88.990' }
    const v = valores({ titulo: 'Mate imperial', linkTienda: ML, precio: '$88.990' })
    const fallas: Contestado[] = [null, 'muchos', ...(['no-carga', 'no-esta', 'sin-datos', 'bloqueado'] as const).map(
      (estado): RespuestaLink => ({ estado, titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' }))]
    for (const r of fallas) {
      const c = queCompletar(v, ML, r, puesto)!
      const cual = String(r && typeof r === 'object' ? r.estado : r)
      expect(c.precio, cual).toBeUndefined()
      expect('foto' in c, cual).toBe(false)
      expect(c.titulo, cual).toBe('Mate imperial')
      expect(c.aviso, cual).toBeTruthy()
    }
    // con un título vacío o que es solo el link, el nombre del link
    expect(queCompletar(valores({ titulo: `${ML}  ` }), ML, null, null)).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
    expect(queCompletar(valores({ linkTienda: ML, precio: '$1' }), ML, 'muchos', null)).toMatchObject({ titulo: 'Mate imperial' })
    // con 'ok', lo que puso y este producto no trae sí se vacía
    expect(queCompletar(v, ML, ok({ precio: null, foto: null }), puesto)).toMatchObject({ precio: '', foto: null })
  })

  test('un bloqueado de MercadoLibre aplica el nombre del link, y cómo poner la foto va al lado de Pegar', () => {
    const r: RespuestaLink = { estado: 'bloqueado', titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' }
    const c = queCompletar(valores({ titulo: ML }), ML, r, null)!
    expect(c).toMatchObject({
      titulo: 'Mate imperial', linkTienda: ML,
      aviso: 'MercadoLibre no deja ver la publicación.',
      consejoFoto: CONSEJO_FOTO_ML,
    })
    // no propone foto: no dice nada del producto (la que haya queda)
    expect('foto' in c).toBe(false)
    // el nombre del link se ve en el campo; con el escrito por el dueño, el mismo aviso
    expect(queCompletar(valores({ titulo: 'Mate', linkTienda: ML }), ML, r, null)!.aviso).toBe('MercadoLibre no deja ver la publicación.')
    const zara = queCompletar(valores({ titulo: 'Remera', linkTienda: 'https://www.zara.com/ar/x' }), 'https://www.zara.com/ar/x',
      { estado: 'bloqueado', titulo: null, precio: null, foto: null, sitio: 'zara.com' }, null)!
    expect(zara.aviso).toBe('La tienda no deja ver la página.')
    expect(zara.consejoFoto).toBeUndefined()
    expect(queCompletar(valores({ titulo: ML }), ML, ok(), null)!.consejoFoto).toBeUndefined()
  })

  test('los otros fallos: su aviso, y el nombre del link si el título era solo el link', () => {
    const fallo = (estado: RespuestaLink['estado']): RespuestaLink => ({ estado, titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' })
    const avisos: [Contestado, string][] = [
      [fallo('sin-datos'), 'No encontramos los datos en esa página.'],
      [fallo('no-esta'), 'Esa publicación ya no existe: revisá el link.'],
      [{ ...fallo('no-esta'), sitio: 'tienda.com.ar' }, 'Esa página ya no existe: revisá el link.'],
      [fallo('no-carga'), 'No pudimos abrir esa página.'],
      // no contestó a tiempo o sin red, y el tope: el nombre lo saca el navegador del link
      [null, 'No pudimos abrir esa página.'],
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

describe('loDelAnterior', () => {
  const puesto: Puesto = { link: ML, titulo: 'Mate imperial', linkTienda: ML, precio: '$88.990' }

  test('con el dueño en el título, lo del anterior sale de los otros campos; el título queda (y sigue como puesto)', () => {
    const v = valores({ titulo: `Mate imperial ${OTRO}`, linkTienda: ML, precio: '$88.990' })
    // queda marcado como del link anterior (tituloDe): al dejar el título se saca, y nada más
    expect(loDelAnterior(v, OTRO, puesto, true)).toEqual({ campos: { linkTienda: '', precio: '' }, puesto: { link: OTRO, titulo: 'Mate imperial', tituloDe: ML } })
    const w = valores({ titulo: 'Mate imperial', linkTienda: OTRO, precio: '$88.990' })
    expect(loDelAnterior(w, OTRO, puesto, true)).toEqual({ campos: { precio: '' }, puesto: { link: OTRO, titulo: 'Mate imperial', tituloDe: ML } })
    // sin el dueño ahí, sí
    expect(loDelAnterior(w, OTRO, puesto)!.campos).toEqual({ titulo: 'Termo stanley', precio: '' })
  })

  test('al buscar otro link, lo que puso el anterior y nadie tocó se saca enseguida', () => {
    expect(loDelAnterior(valores({ titulo: OTRO }), OTRO, null)).toBeNull()
    expect(loDelAnterior(valores({ titulo: ML }), ML, puesto)).toBeNull()
    expect(loDelAnterior(valores({ titulo: OTRO, linkTienda: ML, precio: '$88.990' }), OTRO, puesto))
      .toEqual({ campos: { linkTienda: '', precio: '' }, puesto: { link: OTRO } })
  })

  test('con el link nuevo en la tienda, el título queda con el nombre de ese link (vacío frenaba el envío)', () => {
    const v = valores({ titulo: 'Mate imperial', linkTienda: OTRO, precio: '$1' })
    const antes = loDelAnterior(v, OTRO, puesto)!
    expect(antes).toEqual({ campos: { titulo: 'Termo stanley' }, puesto: { link: OTRO, titulo: 'Termo stanley' } })
    expect(deseoDesdeForm(fd({ ...v, ...antes.campos }))).toMatchObject({ titulo: 'Termo stanley', linkTienda: OTRO, precio: '$1' })
    // sin nombre en el link, el sitio
    expect(loDelAnterior(valores({ titulo: 'Mate imperial', linkTienda: 'https://www.zara.com/ar/campera' }), 'https://www.zara.com/ar/campera', puesto)!.campos.titulo)
      .toBe('zara.com')
  })

  test('pegado al lado del nombre anterior, el título queda con el link solo: no se guarda con el nombre del otro', () => {
    const v = valores({ titulo: `Mate imperial ${OTRO}`, linkTienda: ML })
    const antes = loDelAnterior(v, OTRO, puesto)!
    expect(antes.campos).toEqual({ titulo: OTRO, linkTienda: '' })
    expect(deseoDesdeForm(fd({ ...v, ...antes.campos }))).toMatchObject({ titulo: 'Termo stanley', linkTienda: OTRO })
    // con texto del dueño al lado, queda
    expect(loDelAnterior(valores({ titulo: `Para papá ${OTRO}`, linkTienda: ML }), OTRO, puesto)!.campos).toEqual({ linkTienda: '' })
  })

  test('el mismo producto (sin el #… ni lo que se agrega para seguir de dónde vino) no saca nada', () => {
    const conTodo = `${ML}?tracking_id=abc123&c_id=9#position=1`
    const p: Puesto = { ...puesto, link: conTodo, linkTienda: conTodo }
    for (const igual of [ML, `${ML}?tracking_id=abc123`, `${ML}?c_id=9`, `${ML}?tracking_id=ab`, `${ML}/`, `${ML}?tracking_id=xyz&matt_tool=1`]) {
      // en los dos sentidos: el link limpio y después el mismo con lo de seguimiento (copiado de nuevo de la app)
      expect(mismoProducto(igual, conTodo), igual).toBe(true)
      expect(mismoProducto(conTodo, igual), igual).toBe(true)
      expect(loDelAnterior(valores({ titulo: 'Mate imperial', linkTienda: igual, precio: '$88.990' }), igual, p), igual).toBeNull()
    }
    expect(mismoProducto('https://tienda.com.ar/mate?utm_source=ig&fbclid=x&gclid=y', 'https://tienda.com.ar/mate')).toBe(true)
  })

  test('otro valor en el ?… es otro producto, aunque sea un pedazo del anterior', () => {
    const pares: [string, string][] = [
      ['https://tienda.com.ar/item?id=124', 'https://tienda.com.ar/item?id=1245'],
      ['https://tienda.com/?p=124', 'https://tienda.com/?p=123'],
      // WooCommerce y OpenCart
      ['https://tienda.com.ar/?product=mate-imperial', 'https://tienda.com.ar/?product=mate-imperial-grande'],
      ['https://tienda.com.ar/index.php?route=product/product&product_id=50', 'https://tienda.com.ar/index.php?route=product/product&product_id=503'],
      // la variante de Shopify es otro precio y otra foto
      ['https://tienda.com.ar/products/remera', 'https://tienda.com.ar/products/remera?variant=4455'],
      // otro camino, u otro sitio
      [OTRO, ML],
      [ML, ML.replace('mercadolibre.com.ar', 'mercadolibre.com.mx')],
    ]
    for (const [a, b] of pares) {
      expect(mismoProducto(a, b), a).toBe(false)
      expect(mismoProducto(b, a), b).toBe(false)
    }
    const p: Puesto = { link: 'https://tienda.com.ar/item?id=1245', titulo: 'Producto A', linkTienda: 'https://tienda.com.ar/item?id=1245', precio: '$1.000' }
    const b = 'https://tienda.com.ar/item?id=124'
    expect(loDelAnterior(valores({ titulo: 'Producto A', linkTienda: b, precio: '$1.000' }), b, p))
      .toEqual({ campos: { titulo: 'tienda.com.ar', precio: '' }, puesto: { link: b, titulo: 'tienda.com.ar' } })
  })
})

test('la respuesta del servidor se toma solo con la forma de RespuestaLink', () => {
  expect(respuestaLink(ok())).toEqual(ok())
  expect(respuestaLink({ ...ok(), html: '<html>' })).toEqual(ok())
  for (const x of [null, 'ok', [], { ...ok(), estado: 'raro' }, { ...ok(), titulo: 3 }, { ...ok(), sitio: null }, { ...ok(), foto: {} }]) {
    expect(respuestaLink(x), JSON.stringify(x)).toBeNull()
  }
})

describe('qué cuenta como pegado', () => {
  test('lo pegado, o lo que el teclado escribió de una vez (la tira del portapapeles de Gboard); letra por letra, no', () => {
    expect(loQueEntro({ inputType: 'insertFromPaste', data: ML })).toBe(ML)
    // el navegador que no lo da en data: lo tiene el paste de antes
    expect(loQueEntro({ inputType: 'insertFromPaste', data: null }, ML)).toBe(ML)
    expect(loQueEntro({ inputType: 'insertFromPaste', data: null })).toBe('')
    // Gboard manda el link de la tira del portapapeles como insertText, todo junto
    expect(loQueEntro({ inputType: 'insertText', data: ML })).toBe(ML)
    expect(loQueEntro({ inputType: 'insertText', data: 'x' })).toBeNull()
    // lo que el teclado va armando trae la palabra entera, también un link a medio escribir
    expect(loQueEntro({ inputType: 'insertCompositionText', data: 'https://tienda.com.ar/producto/mate-imp' })).toBeNull()
    expect(loQueEntro({ inputType: 'insertReplacementText', data: 'calabaza' })).toBeNull()
    expect(loQueEntro({ inputType: 'deleteContentBackward', data: null })).toBeNull()
  })

  test('lo pegado trae el link también con la puntuación de la oración al final', () => {
    const link = 'https://tienda.com.ar/producto/mate-imperial'
    // en el título se toma sin el punto (linkEnTexto); en "Link a la tienda", tal cual (como el servidor)
    expect(traeElLink(`${link}.`, link)).toBe(true)
    expect(traeElLink(`Mirá este mate: ${link}.`, link)).toBe(true)
    expect(traeElLink(`${link}.`, `${link}.`)).toBe(true)
    expect(traeElLink('tienda.com.ar/producto/mate-imperial', link)).toBe(true)
    expect(traeElLink(' para papá', link)).toBe(false)
    expect(traeElLink(OTRO, link)).toBe(false)
  })
})

describe('completador: cuándo se pide', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /** El formulario de mentira: los tres campos, la línea de estado, las fotos propuestas y los pedidos sin contestar. */
  function armar(inicial: Partial<Valores> = {}, guardado: string | null = null, tituloGuardado: string | null = null) {
    const v = valores(inicial)
    const fotos: (string | null)[] = []
    const linea: { texto: string; consejoFoto?: string } = { texto: '' }
    const foco: { campo: Campo | null } = { campo: null }
    const pedidos: { link: string; signal: AbortSignal; contestar: (r: Contestado | undefined) => void }[] = []
    const pedir = vi.fn((link: string, signal: AbortSignal) => new Promise<Contestado | undefined>((contestar, fallar) => {
      pedidos.push({ link, signal, contestar })
      signal.addEventListener('abort', () => fallar(new Error('cortado')))
    }))
    const c = completador({
      guardado, tituloGuardado, pedir, leer: () => ({ ...v }), enfocado: () => foco.campo,
      mostrar: (l) => { Object.assign(linea, { texto: l.aviso, consejoFoto: l.consejoFoto }) },
      escribir: (campos, foto) => {
        for (const k of ['titulo', 'linkTienda', 'precio'] as const) if (campos[k] !== undefined) v[k] = campos[k]
        if (foto !== undefined) fotos.push(foto)
      },
    })
    /** Escribir a mano: el campo queda con valor. */
    const cambiar = (campo: keyof Valores, valor: string) => {
      v[campo] = valor
      c.alCambiar(null)
    }
    /** Pegar: el campo queda con valor, y lo pegado fue texto (por defecto, todo el campo). */
    const pegar = (campo: keyof Valores, valor: string, texto = valor) => {
      v[campo] = valor
      c.alCambiar(texto)
    }
    /** Dejar un campo (por defecto, la tienda); va: adónde pasa el foco. */
    const dejar = (campo: Campo = 'linkTienda', va: Destino = null) => {
      foco.campo = null
      c.alDejar(campo, va)
      if (va !== 'enviar') foco.campo = va
    }
    /**
     * Tocar "Agregar": el foco pasa al botón (en Safari no, y el click llega igual) y, si el título no quedó vacío (el
     * navegador frenaba con "Completá este campo"), se manda. conEnter: Enter en un campo toca el botón sin sacar el foco.
     */
    const agregar = (conEnter = false) => {
      if (foco.campo && !conEnter) dejar(foco.campo, 'enviar')
      c.antesDeMandar()
      if (v.titulo.trim()) c.alMandar()
      return !!v.titulo.trim()
    }
    return { v, fotos, linea, foco, pedidos, pedir, cambiar, pegar, dejar, agregar, mandar: c.alMandar, cerrar: c.cerrar }
  }

  /** Pegar ML en el título y que vuelva completo (sin el foco en el título, como si hubiera vuelto después de dejarlo). */
  async function completado(f: ReturnType<typeof armar>, r = ok()) {
    f.pegar('titulo', ML)
    f.pedidos.at(-1)!.contestar(r)
    await vi.advanceTimersByTimeAsync(0)
  }

  test('un pegado se pide en el momento y completa al volver; mientras, la línea dice dónde busca', async () => {
    const f = armar()
    f.pegar('titulo', ML)
    expect(f.pedidos.map((p) => p.link)).toEqual([ML])
    expect(f.linea.texto).toBe(avisoBuscando(ML))
    expect(f.linea.texto).toBe('Buscando el producto en mercadolibre.com.ar…')
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })
    expect(f.fotos).toEqual([FOTO])
    expect(f.linea.texto).toBe('Completamos nombre y precio: revisalos.')
    // seguir escribiendo en el título no vuelve a pedir
    f.cambiar('titulo', 'Mate imperial de calabaza grande')
    f.dejar('titulo')
    expect(f.pedir).toHaveBeenCalledTimes(1)
  })

  test('lo escrito a mano se busca solo al dejar el campo, nunca con un reloj: no se lee un pedazo del link', async () => {
    for (const campo of ['linkTienda', 'titulo'] as const) {
      const f = armar()
      f.foco.campo = campo
      // con pausas largas (cambiar al teclado de símbolos, buscar el "-"): antes salía un pedido por pedazo
      for (const pedazo of ['lacasadelmate.com', 'lacasadelmate.com.ar', 'lacasadelmate.com.ar/producto', 'lacasadelmate.com.ar/producto/mate',
        'lacasadelmate.com.ar/producto/mate-imp', 'lacasadelmate.com.ar/producto/mate-imperial-de-calabaza']) {
        f.cambiar(campo, campo === 'titulo' ? `https://${pedazo}` : pedazo)
        await vi.advanceTimersByTimeAsync(60_000)
      }
      expect(f.pedir, campo).not.toHaveBeenCalled()
      expect(f.v, campo).toMatchObject({ precio: '' })
      // dejar el campo lo busca ya
      f.dejar(campo)
      expect(f.pedidos.map((p) => p.link), campo).toEqual(['https://lacasadelmate.com.ar/producto/mate-imperial-de-calabaza'])
      f.dejar(campo)
      expect(f.pedir, campo).toHaveBeenCalledTimes(1)
    }
  })

  test('la home de una tienda no se pide nunca, ni escrita ni pegada', async () => {
    const g = armar()
    g.cambiar('linkTienda', 'lacasadelmate.com')
    g.dejar()
    g.cambiar('linkTienda', '')
    g.pegar('titulo', 'https://www.zara.com/')
    expect(g.pedir).not.toHaveBeenCalled()
    expect(g.linea.texto).toBe('')
    // con un ?… sí (hay tiendas con el producto ahí)
    g.pegar('titulo', 'https://tienda.com.ar/?product=mate')
    expect(g.pedir).toHaveBeenCalledTimes(1)
  })

  test('un pegado con la puntuación de la oración al final se busca en el momento', async () => {
    const f = armar()
    f.pegar('titulo', 'Mirá este mate: https://tienda.com.ar/producto/mate-imperial.')
    expect(f.pedidos.map((p) => p.link)).toEqual(['https://tienda.com.ar/producto/mate-imperial'])
    const g = armar()
    g.pegar('linkTienda', 'https://tienda.com.ar/producto/mate-imperial.')
    expect(g.pedidos.map((p) => p.link)).toEqual(['https://tienda.com.ar/producto/mate-imperial.'])
  })

  test('el mismo link pegado de nuevo no se pide otra vez (se completa con lo leído), salvo que no haya cargado', async () => {
    const f = armar()
    f.pegar('titulo', ML)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    f.cambiar('titulo', '')
    f.cambiar('linkTienda', '')
    expect(f.linea.texto).toBe('')
    f.pegar('titulo', ML)
    expect(f.pedir).toHaveBeenCalledTimes(1)
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })

    // uno que no cargó se vuelve a pedir si se pega de nuevo (sin reintentos solos)
    f.pegar('titulo', OTRO)
    f.pedidos[1].contestar({ estado: 'no-carga', titulo: 'Termo stanley', precio: null, foto: null, sitio: 'mercadolibre.com.ar' })
    await vi.advanceTimersByTimeAsync(LEER_LINK_MS)
    expect(f.pedir).toHaveBeenCalledTimes(2)
    f.pegar('titulo', OTRO)
    expect(f.pedidos.map((p) => p.link)).toEqual([ML, OTRO, OTRO])
  })

  test('un link nuevo corta el pedido anterior, y lo que llega de ese se descarta', async () => {
    const f = armar()
    f.pegar('titulo', ML)
    f.pegar('titulo', OTRO)
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
    f.pegar('titulo', ML)
    f.cambiar('titulo', 'Mate')
    expect(f.pedidos[0].signal.aborted).toBe(true)
    expect(f.linea.texto).toBe('')
    await vi.advanceTimersByTimeAsync(LEER_LINK_MS)
    expect(f.v).toEqual(valores({ titulo: 'Mate' }))
  })

  test('a los 9 s se corta: no cargó, con el nombre del link', async () => {
    const f = armar()
    f.pegar('titulo', ML)
    await vi.advanceTimersByTimeAsync(LEER_LINK_MS - 1)
    expect(f.pedidos[0].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.pedidos[0].signal.aborted).toBe(true)
    expect(f.v).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
    expect(f.linea.texto).toBe('No pudimos abrir esa página.')
  })

  test('sin sesión o un link que el servidor no toma: no se escribe ni se avisa nada', async () => {
    const f = armar()
    f.pegar('titulo', ML)
    f.pedidos[0].contestar(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual(valores({ titulo: ML }))
    expect(f.linea.texto).toBe('')
    expect(f.fotos).toEqual([])
  })

  test('el tope por usuario: su aviso, y el nombre del link', async () => {
    const f = armar()
    f.pegar('titulo', ML)
    f.pedidos[0].contestar('muchos')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
    expect(f.linea.texto).toBe(AVISO_MUCHOS)
  })

  test('al editar no se pide nada hasta que cambie el link guardado', async () => {
    const guardado = 'https://www.zara.com/ar/campera-1234.html'
    const f = armar({ titulo: 'Campera', linkTienda: guardado, precio: '$50.000' }, guardado, 'Campera')
    f.cambiar('titulo', 'Campera negra')
    f.dejar('titulo')
    expect(f.pedir).not.toHaveBeenCalled()
    f.pegar('linkTienda', ML)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    // ya hay título y precio: solo la foto, que FotoField toma si no hay una
    expect(f.v).toEqual({ titulo: 'Campera negra', linkTienda: ML, precio: '$50.000' })
    expect(f.fotos).toEqual([FOTO])
  })

  test('al editar, el link del título igual al guardado o al que tenía al abrir no dispara nada', async () => {
    const G = 'https://www.zara.com/ar/campera-1234.html'
    // un deseo de antes con el link en el título y también a la tienda: corregir una letra del título pedía G
    const f = armar({ titulo: `Camprea ${G}`, linkTienda: G }, G, `Camprea ${G}`)
    f.cambiar('titulo', `Campera ${G}`)
    f.dejar('titulo')
    f.pegar('titulo', `Campera ${G}`, G)
    // con el link solo en el título
    const g = armar({ titulo: `Camprea ${G}` }, null, `Camprea ${G}`)
    g.cambiar('titulo', `Campera ${G}`)
    g.dejar('titulo')
    for (const x of [f, g]) {
      expect(x.pedir).not.toHaveBeenCalled()
      expect(x.v.precio).toBe('')
      expect(x.v.titulo).toBe(`Campera ${G}`)
    }
    // otro link, sí
    g.pegar('linkTienda', ML)
    expect(g.pedidos.map((p) => p.link)).toEqual([ML])
  })

  test('con otro link, lo del anterior se saca apenas se pide (si manda antes, no se guarda con lo del otro)', async () => {
    const f = armar()
    f.pegar('titulo', ML)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    f.pegar('titulo', OTRO)
    // el título tiene el link nuevo y la tienda quedó vacía: el servidor movería este
    expect(f.v).toEqual(valores({ titulo: OTRO }))
    expect(f.fotos).toEqual([FOTO, null])
    expect(deseoDesdeForm(fd({ ...f.v }))).toMatchObject({ titulo: 'Termo stanley', linkTienda: OTRO, precio: null })
    f.pedidos[1].contestar(ok({ titulo: 'Termo Stanley', precio: '$120.000', foto: null }))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Termo Stanley', linkTienda: OTRO, precio: '$120.000' })
  })

  test('al cerrarse el formulario se corta lo que esté en curso, y lo que llega no se aplica', async () => {
    const f = armar()
    f.cambiar('linkTienda', ML)
    f.cerrar()
    f.dejar()
    expect(f.pedir).not.toHaveBeenCalled()
    f.pegar('linkTienda', OTRO)
    expect(f.linea.texto).toBe(avisoBuscando(OTRO))
    f.cerrar()
    expect(f.pedidos[0].signal.aborted).toBe(true)
    // ya no dice que busca
    expect(f.linea.texto).toBe('')
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.fotos).toEqual([])
    // queda el nombre del link que se puso mientras buscaba
    expect(f.v).toEqual(valores({ titulo: 'Termo stanley', linkTienda: OTRO }))
  })

  test('al mandar se corta lo que esté en curso: mientras dice "Guardando…" ya no dice que busca, y lo que llega no va', async () => {
    const f = armar()
    f.pegar('linkTienda', OTRO)
    f.mandar()
    expect(f.pedidos[0].signal.aborted).toBe(true)
    expect(f.linea.texto).toBe('')
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.fotos).toEqual([])
    expect(f.v).toEqual(valores({ titulo: 'Termo stanley', linkTienda: OTRO }))
  })

  test('al mandar con un link escrito sin buscar, no se pide: lo del producto anterior sale antes de armar lo que se manda', async () => {
    for (const titulo of [OTRO, `Mate imperial de calabaza ${OTRO}`]) {
      const f = armar()
      await completado(f)
      // escribe otro link en el título y aprieta Enter (sin dejar el campo)
      f.foco.campo = 'titulo'
      f.cambiar('titulo', titulo)
      f.mandar()
      expect(f.pedir, titulo).toHaveBeenCalledTimes(1)
      // la tienda tenía el link de ML que puso el autocompletado: el servidor dejaba el del título en el título, con el
      // precio y la foto del mate
      expect(f.v, titulo).toEqual(valores({ titulo: OTRO }))
      expect(f.fotos, titulo).toEqual([FOTO, null])
      expect(deseoDesdeForm(fd({ ...f.v })), titulo).toMatchObject({ titulo: 'Termo stanley', linkTienda: OTRO, precio: null })
    }
    // escrito en la tienda: el nombre del mate tampoco va
    const g = armar()
    await completado(g)
    g.cambiar('linkTienda', OTRO)
    g.mandar()
    expect(g.pedir).toHaveBeenCalledTimes(1)
    expect(g.v).toEqual({ titulo: 'Termo stanley', linkTienda: OTRO, precio: '' })
    // lo que escribió el dueño queda
    const h = armar()
    await completado(h)
    h.v.titulo = 'Mate para papá'
    h.v.precio = '$90.000'
    h.cambiar('linkTienda', OTRO)
    h.mandar()
    expect(h.v).toEqual({ titulo: 'Mate para papá', linkTienda: OTRO, precio: '$90.000' })
  })

  test('pegar algo que no es el link, después de completar, no cambia nada ni vuelve a proponer la foto', async () => {
    const f = armar()
    await completado(f)
    // borró el precio a propósito y pega "para papá" al final del título: el precio volvía, y la foto que había quitado
    f.v.precio = ''
    const linea = f.linea.texto
    f.pegar('titulo', 'Mate imperial de calabaza para papá', ' para papá')
    f.pegar('linkTienda', `${ML}`, 'algo')
    f.dejar('titulo')
    f.dejar()
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza para papá', linkTienda: ML, precio: '' })
    expect(f.fotos).toEqual([FOTO])
    expect(f.linea.texto).toBe(linea)
    expect(f.pedir).toHaveBeenCalledTimes(1)
    // pegar el link otra vez sí vuelve a completar (con lo leído)
    f.pegar('titulo', `Mate imperial de calabaza para papá ${ML}`, ML)
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza para papá', linkTienda: ML, precio: '$88.990' })
    expect(f.fotos).toEqual([FOTO, FOTO])
    expect(f.pedir).toHaveBeenCalledTimes(1)
  })

  test('un texto pegado sin el link no vuelve a pedir el que no cargó (ni el del tope)', async () => {
    const f = armar({ titulo: 'Mate' })
    f.pegar('linkTienda', ML)
    f.pedidos[0].contestar({ estado: 'no-carga', titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' })
    await vi.advanceTimersByTimeAsync(0)
    f.pegar('titulo', 'Mate imperial', ' imperial')
    f.pegar('titulo', 'Mate imperial de calabaza', ' de calabaza')
    expect(f.pedir).toHaveBeenCalledTimes(1)
    // pegar el link de nuevo sí
    f.pegar('linkTienda', ML)
    expect(f.pedir).toHaveBeenCalledTimes(2)
  })

  test('otro link en la tienda deja un título que se puede mandar mientras busca, y si no contesta queda así', async () => {
    const f = armar()
    f.pegar('linkTienda', ML)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v.titulo).toBe('Mate imperial de calabaza')
    f.pegar('linkTienda', OTRO)
    // vacío frenaba "Agregar" con "Completá este campo" hasta que volviera (9 s)
    expect(f.v).toEqual({ titulo: 'Termo stanley', linkTienda: OTRO, precio: '' })
    expect(deseoDesdeForm(fd({ ...f.v }))).toMatchObject({ titulo: 'Termo stanley', linkTienda: OTRO, precio: null })
    expect(f.fotos).toEqual([FOTO, null])
    // sin sesión (o un link que el servidor no toma): queda el nombre del link
    f.pedidos[1].contestar(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v.titulo).toBe('Termo stanley')
    // y si contesta, el de la página lo reemplaza
    f.pegar('linkTienda', ML)
    f.pegar('linkTienda', OTRO)
    f.pedidos[2].contestar(ok({ titulo: 'Termo Stanley Clásico 1 L', precio: '$120.000' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Termo Stanley Clásico 1 L', linkTienda: OTRO, precio: '$120.000' })
  })

  test('recortar a mano el link de la tienda (el mismo producto) no saca nada ni vuelve a pedir', async () => {
    const f = armar()
    const conSeguimiento = `${ML}?tracking_id=abc123`
    f.pegar('linkTienda', conSeguimiento)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    const completo = { ...f.v }
    f.cambiar('linkTienda', `${ML}?tracking_id=`)
    f.cambiar('linkTienda', ML)
    f.dejar()
    expect(f.pedir).toHaveBeenCalledTimes(1)
    expect(f.v).toEqual({ ...completo, linkTienda: ML })
    expect(f.fotos).toEqual([FOTO])
    // pegado recortado tampoco se pide (se completa con lo leído, como el mismo link)
    f.pegar('linkTienda', `${ML}#position=3`)
    expect(f.pedir).toHaveBeenCalledTimes(1)
    expect(f.v).toEqual({ ...completo, linkTienda: `${ML}#position=3` })
  })

  test('el mismo producto pegado con lo de seguimiento (copiado de nuevo de la app) no se pide ni saca nada', async () => {
    const f = armar()
    await completado(f)
    const completo = { ...f.v }
    f.pegar('linkTienda', `${ML}?tracking_id=abc123&matt_tool=7#position=2`)
    expect(f.pedir).toHaveBeenCalledTimes(1)
    expect(f.v).toEqual({ ...completo, linkTienda: `${ML}?tracking_id=abc123&matt_tool=7#position=2` })
    // la foto no se saca: se propone la misma, que FotoField no vuelve a traer (ver queHacerConPropuesta)
    expect(f.fotos).toEqual([FOTO, FOTO])
    expect(queHacerConPropuesta({ src: FOTO, anterior: FOTO, trayendo: false, hayFoto: true, dePropuesta: true, subiendo: false })).toBe('nada')
  })

  test('un link con otro valor en el ?…, aunque sea un pedazo del anterior, es otro producto', async () => {
    const A = 'https://tienda.com.ar/item?id=1245'
    const B = 'https://tienda.com.ar/item?id=124'
    for (const campo of ['titulo', 'linkTienda'] as const) {
      const f = armar()
      f.pegar('titulo', A)
      f.pedidos[0].contestar(ok({ titulo: 'Producto A', precio: '$1.000', foto: FOTO, sitio: 'tienda.com.ar' }))
      await vi.advanceTimersByTimeAsync(0)
      expect(f.v).toEqual({ titulo: 'Producto A', linkTienda: A, precio: '$1.000' })
      f.pegar(campo, B)
      // se pide, y mientras tanto lo de A no queda con el link de B
      expect(f.pedidos.map((p) => p.link), campo).toEqual([A, B])
      expect(f.fotos, campo).toEqual([FOTO, null])
      expect(f.v.precio, campo).toBe('')
      expect(f.v.titulo, campo).not.toBe('Producto A')
      f.pedidos[1].contestar(ok({ titulo: 'Producto B', precio: '$2.000', foto: null, sitio: 'tienda.com.ar' }))
      await vi.advanceTimersByTimeAsync(0)
      expect(f.v, campo).toEqual({ titulo: 'Producto B', linkTienda: B, precio: '$2.000' })
    }
  })

  test('borrar a mano parte del link: mientras borra no pasa nada; al dejar el campo es otro link y se busca', async () => {
    const A = 'https://tienda.com.ar/item?id=1245'
    const f = armar()
    f.pegar('titulo', A)
    f.pedidos[0].contestar(ok({ titulo: 'Producto A', precio: '$1.000', foto: FOTO, sitio: 'tienda.com.ar' }))
    await vi.advanceTimersByTimeAsync(0)
    const completo = { ...f.v }
    // borra el último número de a una letra, con una pausa larga: no se busca ni se saca nada
    f.cambiar('linkTienda', A.slice(0, -1))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.pedir).toHaveBeenCalledTimes(1)
    expect(f.v).toEqual({ ...completo, linkTienda: A.slice(0, -1) })
    expect(f.fotos).toEqual([FOTO])
    // al dejarlo (por ejemplo para tocar "Agregar"), ?id=124 es otro producto: no se guarda con el nombre, el precio y la
    // foto de ?id=1245
    f.dejar()
    expect(f.pedidos.map((p) => p.link)).toEqual([A, A.slice(0, -1)])
    expect(f.v).toEqual({ titulo: 'tienda.com.ar', linkTienda: A.slice(0, -1), precio: '' })
    expect(f.fotos).toEqual([FOTO, null])
    // lo borra entero: nada que buscar
    f.cambiar('linkTienda', '')
    f.dejar()
    expect(f.pedir).toHaveBeenCalledTimes(2)
  })

  test('una letra de más es otro link: al dejar el campo saca lo del anterior y se busca; si falla, no vacía nada más', async () => {
    const fallas: Contestado[] = [null, 'muchos', { estado: 'no-esta', titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' }]
    for (const r of fallas) {
      const f = armar()
      await completado(f)
      f.cambiar('linkTienda', `${ML}x`)
      // mientras escribe, nada
      expect(f.pedir).toHaveBeenCalledTimes(1)
      expect(f.fotos).toEqual([FOTO])
      f.dejar()
      expect(f.pedidos.map((p) => p.link)).toEqual([ML, `${ML}x`])
      const mientras = { titulo: 'Mate imperial', linkTienda: `${ML}x`, precio: '' }
      expect(f.v).toEqual(mientras)
      expect(f.fotos).toEqual([FOTO, null])
      f.pedidos[1].contestar(r)
      await vi.advanceTimersByTimeAsync(0)
      // solo el aviso: nada se vacía ni se vuelve a proponer
      expect(f.v).toEqual(mientras)
      expect(f.fotos).toEqual([FOTO, null])
      expect(f.linea.texto).not.toBe('')
    }
  })

  test('pegado en la tienda con el título vacío, el nombre del link va enseguida (se puede mandar) y la respuesta lo cambia', async () => {
    const f = armar()
    f.pegar('linkTienda', ML)
    expect(f.v).toEqual(valores({ titulo: 'Mate imperial', linkTienda: ML }))
    expect(deseoDesdeForm(fd({ ...f.v }))).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })
    // lo que escribe en el título mientras busca queda
    const g = armar()
    g.pegar('linkTienda', 'https://www.zara.com/ar/campera')
    expect(g.v.titulo).toBe('zara.com')
    g.v.titulo = 'Campera negra'
    g.pedidos[0].contestar(ok({ titulo: 'Campera de cuero', sitio: 'zara.com' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(g.v.titulo).toBe('Campera negra')
  })

  test('el nombre provisorio no va en un título que tiene el foco o que lo va a tener; se pone al dejarlo', async () => {
    // escribió el link en la tienda y toca "¿Qué querés?" para escribir el título: se busca al dejar la tienda
    const f = armar()
    f.cambiar('linkTienda', ML)
    f.dejar('linkTienda', 'titulo')
    expect(f.pedidos.map((p) => p.link)).toEqual([ML])
    // "Mate imperial" en el título justo cuando entraba el foco: lo que escribía quedaba "Mate imperialTermo"
    expect(f.v.titulo).toBe('')
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: '', linkTienda: ML, precio: '$88.990' })
    // si no escribe nada y lo deja, el nombre
    f.dejar('titulo')
    expect(f.v.titulo).toBe('Mate imperial de calabaza')
    // si escribe el suyo, queda
    const g = armar()
    g.cambiar('linkTienda', ML)
    g.dejar('linkTienda', 'titulo')
    g.cambiar('titulo', 'Termo')
    g.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    g.dejar('titulo')
    expect(g.v).toEqual({ titulo: 'Termo', linkTienda: ML, precio: '$88.990' })
    // si lo deja antes de que vuelva, el nombre del link mientras busca (vacío, "Agregar" quedaba frenado)
    const h = armar()
    h.cambiar('linkTienda', ML)
    h.dejar('linkTienda', 'titulo')
    h.dejar('titulo')
    expect(h.v.titulo).toBe('Mate imperial')
    // lo que ya se puso no se vuelve a poner: si después lo vacía a propósito y lo deja, queda vacío
    f.foco.campo = 'titulo'
    f.cambiar('titulo', '')
    f.dejar('titulo')
    expect(f.v.titulo).toBe('')
  })

  test('con el foco en el título, el título no se toca: ni con el link solo, ni con un espacio, ni con un link a medio escribir', async () => {
    // pega el link y aprieta espacio para escribir "para mamá"; la respuesta llega justo después del espacio
    const f = armar()
    f.foco.campo = 'titulo'
    f.pegar('titulo', ML)
    f.cambiar('titulo', `${ML} `)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: `${ML} `, linkTienda: ML, precio: '$88.990' })
    expect(f.linea.texto).toBe('Completamos el precio: revisalo.')
    f.cambiar('titulo', `${ML} para mamá`)
    f.dejar('titulo')
    expect(f.v.titulo).toBe('para mamá')
    // si al dejarlo sigue siendo solo el link (con espacios o no), el nombre de la página
    for (const titulo of [ML, `${ML}  `]) {
      const g = armar()
      g.foco.campo = 'titulo'
      g.pegar('titulo', ML)
      g.pedidos[0].contestar(ok())
      await vi.advanceTimersByTimeAsync(0)
      g.cambiar('titulo', titulo)
      expect(g.v.titulo).toBe(titulo)
      g.dejar('titulo')
      expect(g.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })
    }
    // un link escrito a mano en el título no se busca hasta dejarlo: no se lee ni se mueve un pedazo
    const h = armar()
    h.foco.campo = 'titulo'
    h.cambiar('titulo', 'https://www.tienda.com.ar/productos/mate-imp')
    await vi.advanceTimersByTimeAsync(60_000)
    h.cambiar('titulo', 'https://www.tienda.com.ar/productos/mate-imperial')
    expect(h.pedir).not.toHaveBeenCalled()
    expect(h.v.linkTienda).toBe('')
    h.dejar('titulo')
    expect(h.pedidos.map((p) => p.link)).toEqual(['https://www.tienda.com.ar/productos/mate-imperial'])
  })

  test('otro link pegado al lado del nombre anterior con el foco en el título: queda hasta dejarlo o mandar', async () => {
    for (const cuando of ['al volver', 'si falla', 'antes de volver'] as const) {
      const f = armar()
      await completado(f)
      f.foco.campo = 'titulo'
      f.pegar('titulo', `Mate imperial de calabaza ${OTRO}`, OTRO)
      // el título no se toca; lo del mate sale de los otros campos
      expect(f.v).toEqual(valores({ titulo: `Mate imperial de calabaza ${OTRO}` }))
      expect(f.fotos).toEqual([FOTO, null])
      if (cuando === 'al volver') {
        f.pedidos[1].contestar(ok({ titulo: 'Termo Stanley', precio: '$120.000' }))
        await vi.advanceTimersByTimeAsync(0)
        expect(f.v).toEqual({ titulo: `Mate imperial de calabaza ${OTRO}`, linkTienda: OTRO, precio: '$120.000' })
      }
      if (cuando === 'si falla') {
        f.pedidos[1].contestar('muchos')
        await vi.advanceTimersByTimeAsync(0)
        expect(f.v).toEqual({ titulo: `Mate imperial de calabaza ${OTRO}`, linkTienda: OTRO, precio: '' })
      }
      // aprieta Enter: el servidor dejaba "Mate imperial de calabaza" (el nombre del otro) con el link del termo
      f.mandar()
      const esperado = cuando === 'al volver' ? 'Termo Stanley' : 'Termo stanley'
      expect(deseoDesdeForm(fd({ ...f.v })), cuando).toMatchObject({ titulo: esperado, linkTienda: OTRO })
    }
    // al dejarlo, igual
    const g = armar()
    await completado(g)
    g.foco.campo = 'titulo'
    g.pegar('titulo', `Mate imperial de calabaza ${OTRO}`, OTRO)
    g.dejar('titulo')
    expect(g.v).toEqual(valores({ titulo: OTRO }))
    g.pedidos[1].contestar(ok({ titulo: 'Termo Stanley', precio: '$120.000' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(g.v).toEqual({ titulo: 'Termo Stanley', linkTienda: OTRO, precio: '$120.000' })
  })

  test('si un cambio corta lo que se estaba buscando, la línea ya no dice "Buscando…"', async () => {
    const f = armar()
    await completado(f)
    f.pegar('linkTienda', OTRO)
    expect(f.linea.texto).toBe(avisoBuscando(OTRO))
    // escribe al lado: se corta y se busca al dejar el campo
    f.cambiar('linkTienda', `${OTRO}z`)
    expect(f.pedidos[1].signal.aborted).toBe(true)
    expect(f.linea.texto).toBe('')
    f.dejar()
    expect(f.linea.texto).toBe(avisoBuscando(`${OTRO}z`))
  })

  test('otro link pegado al lado del nombre anterior: el título queda con el link solo hasta que vuelva', async () => {
    const f = armar()
    await completado(f)
    f.pegar('titulo', `Mate imperial de calabaza ${OTRO}`, OTRO)
    // si mandaba antes de que volviera, se guardaba el nombre del mate con el link del termo
    expect(f.v).toEqual(valores({ titulo: OTRO }))
    expect(deseoDesdeForm(fd({ ...f.v }))).toMatchObject({ titulo: 'Termo stanley', linkTienda: OTRO })
    f.pedidos[1].contestar(ok({ titulo: 'Termo Stanley', precio: '$120.000' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Termo Stanley', linkTienda: OTRO, precio: '$120.000' })
  })

  test('lo que escribe al lado del link mientras busca no se toca; al dejar el título, el link sale de ahí', async () => {
    const f = armar()
    f.foco.campo = 'titulo'
    f.pegar('titulo', ML)
    f.cambiar('titulo', `${ML} Para `)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: `${ML} Para `, linkTienda: ML, precio: '$88.990' })
    expect(f.linea.texto).toBe('Completamos el precio: revisalo.')
    f.cambiar('titulo', `${ML} Para mamá`)
    expect(f.pedir).toHaveBeenCalledTimes(1)
    // si manda así, el servidor saca el link del título (es el mismo de la tienda)
    expect(deseoDesdeForm(fd({ ...f.v }))).toMatchObject({ titulo: 'Para mamá', linkTienda: ML })
    f.dejar('titulo')
    expect(f.v.titulo).toBe('Para mamá')
    // un link que el dueño escribió en los dos lados (no lo movió el autocompletado) no se toca al dejar
    const g = armar({ titulo: `Para mamá ${OTRO}`, linkTienda: OTRO })
    g.dejar('titulo')
    expect(g.v.titulo).toBe(`Para mamá ${OTRO}`)
  })

  test('una home o un link que no se busca, pegado en el título después de completar, igual saca lo del anterior', async () => {
    for (const [link, titulo] of [['https://www.zara.com/', 'zara.com'], ['https://10.0.0.1/mate', '10.0.0.1']] as const) {
      const f = armar()
      await completado(f)
      f.pegar('titulo', link)
      expect(f.pedir, link).toHaveBeenCalledTimes(1)
      // la tienda tenía el link de ML que puso el autocompletado: el servidor dejaba el nuevo en el título, con el link,
      // el precio y la foto del mate
      expect(f.v, link).toEqual(valores({ titulo: link }))
      expect(f.fotos, link).toEqual([FOTO, null])
      expect(deseoDesdeForm(fd({ ...f.v })), link).toMatchObject({ titulo, linkTienda: link, precio: null })
    }
  })

  test('al editar, volver al link guardado saca lo que puso el otro y nadie tocó', async () => {
    const guardado = 'https://www.zara.com/ar/campera-1234.html'
    const f = armar({ titulo: 'Campera', linkTienda: guardado }, guardado, 'Campera')
    f.pegar('linkTienda', ML)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Campera', linkTienda: ML, precio: '$88.990' })
    f.pegar('linkTienda', guardado)
    expect(f.v).toEqual({ titulo: 'Campera', linkTienda: guardado, precio: '' })
    expect(f.fotos).toEqual([FOTO, null])
    expect(f.linea.texto).toBe('')
    expect(f.pedir).toHaveBeenCalledTimes(1)
  })

  test('el consejo para la foto de MercadoLibre se va con la línea', async () => {
    const f = armar()
    await completado(f, { estado: 'bloqueado', titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' })
    expect(f.linea).toMatchObject({ texto: 'MercadoLibre no deja ver la publicación.', consejoFoto: CONSEJO_FOTO_ML })
    f.cambiar('linkTienda', '')
    f.cambiar('titulo', 'Mate')
    expect(f.linea).toMatchObject({ texto: '', consejoFoto: undefined })
  })

  test('lo que completó un link no cambia al dejar el título ni al mandar: queda el nombre de la página', async () => {
    const casos: [string, RespuestaLink, string][] = [
      [ML, ok(), 'Mate imperial de calabaza'],
      // sin nombre en el camino: quedaba el sitio
      ['https://tienda.com.ar/item?id=1245', ok({ titulo: 'Remera oversize negra', sitio: 'tienda.com.ar' }), 'Remera oversize negra'],
      // un link corto que no se deja ver, con el nombre del destino: quedaba "meli.la"
      ['https://meli.la/2xYzAbC', { estado: 'bloqueado', titulo: 'Mate imperial', precio: null, foto: null, sitio: 'mercadolibre.com.ar' }, 'Mate imperial'],
    ]
    for (const [link, r, nombre] of casos) {
      for (const como of ['en la tienda', 'en el título', 'en el título, con el foco'] as const) {
        const cual = `${link} ${como}`
        const f = armar()
        if (como === 'en el título, con el foco') f.foco.campo = 'titulo'
        f.pegar(como === 'en la tienda' ? 'linkTienda' : 'titulo', link)
        f.pedidos[0].contestar(r)
        await vi.advanceTimersByTimeAsync(0)
        if (f.foco.campo) f.dejar('titulo')
        expect(f.v.titulo, cual).toBe(nombre)
        // entra al título y sale sin tocarlo
        f.foco.campo = 'titulo'
        f.dejar('titulo')
        expect(f.v.titulo, cual).toBe(nombre)
        expect(f.agregar(), cual).toBe(true)
        expect(deseoDesdeForm(fd({ ...f.v }))?.titulo, cual).toBe(nombre)
      }
    }
  })

  test('el campo donde está el dueño no se toca: el precio y la tienda se escriben al dejarlos', async () => {
    // pegó el link en la tienda y tocó Precio para escribirlo: "$88.990" aparecía con el cursor al final, y lo que tipeaba
    // quedaba "$88.99045000"
    const f = armar()
    f.pegar('linkTienda', ML)
    f.dejar('linkTienda', 'precio')
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '' })
    expect(f.linea.texto).toBe('Completamos el nombre: revisalo.')
    f.v.precio = '$45.000'
    f.dejar('precio')
    expect(f.v.precio).toBe('$45.000')
    expect(f.linea.texto).toBe('Completamos el nombre: revisalo.')
    // si lo deja vacío, el de la página, y la línea lo nombra
    const g = armar()
    g.pegar('linkTienda', ML)
    g.dejar('linkTienda', 'precio')
    g.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    g.dejar('precio')
    expect(g.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })
    expect(g.linea.texto).toBe('Completamos nombre y precio: revisalos.')

    // pegó el link en el título y tocó la tienda para pegarlo ahí también: quedaba dos veces seguido ("…-_JMhttps://…"), y
    // al mandar se tomaba como otro producto y se iban el nombre, el precio y la foto
    for (const despues of ['lo pega', 'la deja', 'Enter'] as const) {
      const h = armar()
      h.foco.campo = 'titulo'
      h.pegar('titulo', ML)
      h.dejar('titulo', 'linkTienda')
      h.pedidos[0].contestar(ok())
      await vi.advanceTimersByTimeAsync(0)
      // el link sigue en el título hasta que la tienda quede libre (si no, no estaba en ningún lado); el precio va
      expect(h.v, despues).toEqual({ titulo: ML, linkTienda: '', precio: '$88.990' })
      if (despues === 'lo pega') h.pegar('linkTienda', ML)
      if (despues === 'Enter') h.agregar(true)
      else h.dejar('linkTienda')
      expect(h.v, despues).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '$88.990' })
      expect(h.pedir, despues).toHaveBeenCalledTimes(1)
      expect(h.fotos.includes(null), despues).toBe(false)
    }
  })

  test('tocar "Agregar" con un link escrito sin buscar no lo pide: se cortaba al mandar y gastaba un pedido del tope', async () => {
    const f = armar({ titulo: 'Mate' })
    f.foco.campo = 'linkTienda'
    f.cambiar('linkTienda', ML)
    expect(f.agregar()).toBe(true)
    expect(f.pedir).not.toHaveBeenCalled()
    expect(f.v).toEqual(valores({ titulo: 'Mate', linkTienda: ML }))
    // con el título vacío va el nombre del link: si no, el navegador frenaba con "Completá este campo"
    const g = armar()
    g.foco.campo = 'linkTienda'
    g.cambiar('linkTienda', ML)
    expect(g.agregar()).toBe(true)
    expect(g.pedir).not.toHaveBeenCalled()
    expect(g.v.titulo).toBe('Mate imperial')
    // después de completar otro producto, lo de ese sale
    const h = armar()
    await completado(h)
    h.foco.campo = 'linkTienda'
    h.cambiar('linkTienda', OTRO)
    expect(h.agregar()).toBe(true)
    expect(h.pedir).toHaveBeenCalledTimes(1)
    expect(h.v).toEqual({ titulo: 'Termo stanley', linkTienda: OTRO, precio: '' })
    expect(h.fotos).toEqual([FOTO, null])
  })

  test('corregir a mano el link del título por el mismo producto no vuelve a poner nada', async () => {
    const conSeguimiento = `${ML}?tracking_id=abc`
    const f = armar()
    f.foco.campo = 'titulo'
    f.pegar('titulo', conSeguimiento)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.v).toEqual({ titulo: conSeguimiento, linkTienda: conSeguimiento, precio: '$88.990' })
    // borra el precio a propósito, saca el tracking a mano y deja el título: volvían el precio y la foto (que, si la había
    // quitado, se traía otra vez)
    f.v.precio = ''
    f.cambiar('titulo', ML)
    f.dejar('titulo')
    expect(f.pedir).toHaveBeenCalledTimes(1)
    expect(f.fotos).toEqual([FOTO])
    // el link pasa a la tienda, como el de la respuesta
    expect(f.v).toEqual({ titulo: 'Mate imperial de calabaza', linkTienda: ML, precio: '' })
  })

  test('lo que se pone al dejar el título también lo dice la línea, y Enter en el título vacío no queda frenado', async () => {
    const f = armar()
    f.foco.campo = 'titulo'
    f.pegar('titulo', ML)
    f.pedidos[0].contestar(ok())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.linea.texto).toBe('Completamos el precio: revisalo.')
    f.dejar('titulo')
    expect(f.v.titulo).toBe('Mate imperial de calabaza')
    expect(f.linea.texto).toBe('Completamos nombre y precio: revisalos.')
    // escribió el link en la tienda y fue al título, que está vacío: Enter ahí lo frenaba el navegador ("Completá este campo")
    for (const cuando of ['mientras busca', 'cuando ya volvió'] as const) {
      const g = armar()
      g.cambiar('linkTienda', ML)
      g.dejar('linkTienda', 'titulo')
      if (cuando === 'cuando ya volvió') {
        g.pedidos[0].contestar(ok())
        await vi.advanceTimersByTimeAsync(0)
      }
      expect(g.v.titulo, cuando).toBe('')
      expect(g.agregar(true), cuando).toBe(true)
      expect(g.v.titulo, cuando).toBe(cuando === 'mientras busca' ? 'Mate imperial' : 'Mate imperial de calabaza')
    }
  })
})

test('la foto que propone el link: se trae una nueva, null saca la que vino así, y la misma no se trae dos veces', () => {
  const OTRA = 'https://http2.mlstatic.com/D_9-O.jpg'
  const sin = { src: FOTO, anterior: null, trayendo: false, hayFoto: false, dePropuesta: false, subiendo: false }
  expect(queHacerConPropuesta(sin)).toBe('traer')
  // la misma que ya está (el mismo producto pegado de nuevo) o que se está trayendo: otro pedido del tope y otra foto del cupo
  expect(queHacerConPropuesta({ ...sin, anterior: FOTO, hayFoto: true, dePropuesta: true })).toBe('nada')
  expect(queHacerConPropuesta({ ...sin, anterior: FOTO, trayendo: true })).toBe('nada')
  // la misma, pero la quitó: si pega el link otra vez, se trae
  expect(queHacerConPropuesta({ ...sin, anterior: FOTO })).toBe('traer')
  // la de otro producto reemplaza la que vino así, o la que se estaba trayendo
  expect(queHacerConPropuesta({ ...sin, src: OTRA, anterior: FOTO, hayFoto: true, dePropuesta: true })).toBe('traer')
  expect(queHacerConPropuesta({ ...sin, src: OTRA, anterior: FOTO, trayendo: true })).toBe('traer')
  // null: el producto nuevo no tiene foto, la del anterior se saca (si no hay ninguna, nada)
  expect(queHacerConPropuesta({ ...sin, src: null, anterior: FOTO, hayFoto: true, dePropuesta: true })).toBe('sacar')
  expect(queHacerConPropuesta({ ...sin, src: null, anterior: FOTO, trayendo: true })).toBe('sacar')
  expect(queHacerConPropuesta({ ...sin, src: null, anterior: FOTO })).toBe('nada')
  // la que eligió el dueño, o mientras sube una, nunca (ver aceptaFotoPropuesta)
  for (const src of [OTRA, null]) {
    expect(queHacerConPropuesta({ ...sin, src, anterior: FOTO, hayFoto: true }), String(src)).toBe('nada')
    expect(queHacerConPropuesta({ ...sin, src, anterior: FOTO, hayFoto: true, dePropuesta: true, subiendo: true }), String(src)).toBe('nada')
  }
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

test('la foto va a la derecha de Foto y Pegar, en el lugar del texto: al llegar sola no corre los botones', () => {
  const pegar = 'aria-label="Pegar una foto copiada"'
  const sinFoto = renderToStaticMarkup(createElement(FotoField, {}))
  expect(sinFoto.indexOf(pegar)).toBeGreaterThan(sinFoto.indexOf('aria-label="Subir una foto'))
  expect(sinFoto).toMatch(new RegExp(`${pegar}[^]*</button><p role="status"[^>]*>La foto es lo que más ayuda a que acierten.</p>`))
  const conFoto = renderToStaticMarkup(createElement(FotoField, { inicial: '/foto/deseo/00000000-0000-4000-8000-000000000001' }))
  expect(conFoto.indexOf('alt="Vista previa de la foto"')).toBeGreaterThan(conFoto.indexOf(pegar))
  expect(conFoto).not.toContain('La foto es lo que más ayuda')
})
