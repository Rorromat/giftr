import { expect, test } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { claveDeVolver, conVolver, esRutaInterna, nombreDeVolver, rutaParaVolver, VOLVER_MAX } from '@/lib/volver'
import { AppHeader, BackLink, PageHeader } from '@/components/ui'

// "Volver" lleva a donde la persona estaba (?volver=), y solo si es una ruta de GiftR: si no, al destino de siempre.

test('vale una ruta de GiftR; otro sitio, un esquema o algo que no es un texto, no', () => {
  for (const ruta of ['/inicio', '/gente', '/gente#sugerencias', '/eventos?mes=10&dia=27', '/l/tok-euge', '/regalos', '/']) {
    expect(esRutaInterna(ruta), ruta).toBe(true)
    expect(rutaParaVolver(ruta, '/inicio')).toBe(ruta)
  }
  const malas = [
    '//otro.com', '/\\otro.com', '\\\\otro.com', 'https://otro.com/inicio', 'javascript:alert(1)', 'inicio', '', ' /inicio', '/ini cio',
    '/inicio\n//otro.com', '/a<b>', `/${'a'.repeat(VOLVER_MAX)}`, undefined, null, 7, ['/gente'], { ruta: '/gente' },
  ]
  for (const mala of malas) {
    expect(esRutaInterna(mala), String(mala).slice(0, 30)).toBe(false)
    expect(rutaParaVolver(mala, '/inicio')).toBe('/inicio')
  }
})

test('el link avisa desde dónde se abre, sin romper su búsqueda ni su ancla', () => {
  expect(conVolver('/avisos', '/gente')).toBe('/avisos?volver=%2Fgente')
  expect(conVolver('/l/tok?disp=1', '/inicio')).toBe('/l/tok?disp=1&volver=%2Finicio')
  expect(conVolver('/perfil#cumple', '/mi-lista')).toBe('/perfil?volver=%2Fmi-lista#cumple')
  // lo que se arma se puede leer de vuelta
  const vuelta = new URL(conVolver('/avisos', '/eventos?mes=10'), 'https://giftr.test').searchParams.get('volver')
  expect(vuelta).toBe('/eventos?mes=10')
  expect(esRutaInterna(vuelta)).toBe(true)
})

test('el botón dice adónde vuelve cuando se sabe', () => {
  expect(nombreDeVolver('/gente')).toBe('Volver a tu gente')
  expect(nombreDeVolver('/inicio#para-vos')).toBe('Volver a Inicio')
  expect(nombreDeVolver('/eventos?mes=10')).toBe('Volver a Todo el año')
  expect(nombreDeVolver('/l/tok-euge')).toBe('Volver')
  expect(claveDeVolver('/avisos')).toBe('gr-volver:/avisos')
})

test('la campanita y tu foto, en cada sección, llevan a Avisos y a Perfil diciendo desde dónde', () => {
  const header = (desde?: string) => renderToStaticMarkup(createElement(AppHeader, { nombre: 'Euge', foto: null, avisos: 2, desde }))
  expect(header('/gente')).toContain('href="/avisos?volver=%2Fgente"')
  expect(header('/gente')).toContain('href="/perfil?volver=%2Fgente"')
  expect(header('/regalos')).toContain('href="/perfil?volver=%2Fregalos"')
  // sin decir desde dónde, los links de siempre
  expect(header()).toContain('href="/avisos"')
  expect(header()).toContain('href="/perfil"')
})

test('"Volver" con origen: el ?volver= si es de GiftR; si no, el destino de siempre', () => {
  const link = (volver: unknown) => renderToStaticMarkup(createElement(BackLink, { href: '/gente', label: 'Volver a tu gente', origen: { pantalla: '/l/tok', volver } }))
  expect(link('/inicio')).toContain('href="/inicio"')
  expect(link('/inicio')).toContain('aria-label="Volver a Inicio"')
  for (const malo of [undefined, '//otro.com', 'https://otro.com']) {
    expect(link(malo)).toContain('href="/gente"')
    expect(link(malo)).toContain('aria-label="Volver a tu gente"')
  }
  // sin origen, el link fijo de siempre, con su nombre
  expect(renderToStaticMarkup(createElement(BackLink, { href: '/gente', label: 'Volver a tu gente' }))).toContain('href="/gente"')
  const pagina = renderToStaticMarkup(createElement(PageHeader, { title: 'Tu perfil', back: '/mi-lista', origen: { pantalla: '/perfil', volver: '/regalos' } }))
  expect(pagina).toContain('href="/regalos"')
  expect(pagina).toContain('aria-label="Volver a tus regalos"')
})
