import { afterEach, expect, test, vi } from 'vitest'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { comoAgregar, entradaAtajo, pasosAtajo, plataformaDe, TEXTOS_APPS, type Plataforma } from '@/lib/agregar-desde-apps'
import {
  alCambiarPedido, ATRAPAR_PEDIDO_INSTALAR, escucharPedidoInstalar, guardarPedidoInstalar, instalarGiftR, puedeInstalar,
  type PedidoInstalar,
} from '@/lib/app-instalable'
import { AgregarDesdeApps } from '@/components/AgregarDesdeApps'
import { GET } from '@/app/compartir/route'

// "Agregar desde otras apps" en Perfil: qué se explica en cada teléfono, el botón de instalar y la receta del atajo del
// iPhone (que tiene que abrir lo que entiende el route /compartir).

const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
  safariIPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1',
  iPad: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  // Safari de la Mac, y también el de un iPad nuevo, que se presenta así
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
}

const ML = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-imperial-de-calabaza-_JM'

afterEach(() => guardarPedidoInstalar(null))

test('plataformaDe con user-agents de verdad: Android e iPhone (también Chrome de iOS y el iPad); la compu, nada', () => {
  for (const ua of [UA.chromeAndroid, UA.samsung, UA.firefoxAndroid]) expect(plataformaDe(ua), ua).toBe('android')
  for (const ua of [UA.safariIPhone, UA.chromeIOS, UA.iPad]) expect(plataformaDe(ua), ua).toBe('ios')
  for (const ua of [UA.safariMac, UA.chromeWindows, UA.chromeLinux, '']) expect(plataformaDe(ua), ua).toBeNull()
})

test('comoAgregar: instalada gana; en una pestaña de Android, recién instalada, el botón o los pasos; en iPhone, app o Safari', () => {
  const de = (plataforma: Plataforma | null, o: { instalada?: boolean; puedeInstalar?: boolean; recienInstalada?: boolean } = {}) =>
    comoAgregar({ plataforma, instalada: false, puedeInstalar: false, recienInstalada: false, ...o })
  expect(de('android')).toBe('android-manual')
  expect(de('android', { puedeInstalar: true })).toBe('android-boton')
  expect(de('android', { recienInstalada: true })).toBe('android-recien')
  expect(de('android', { recienInstalada: true, puedeInstalar: true })).toBe('android-recien')
  for (const o of [{}, { puedeInstalar: true }, { recienInstalada: true }]) expect(de('android', { ...o, instalada: true })).toBe('android-app')
  expect(de('ios')).toBe('ios-safari')
  expect(de('ios', { instalada: true })).toBe('ios-app')
  // en iPhone no hay pedido de instalar (Safari no lo tiene)
  expect(de('ios', { puedeInstalar: true, recienInstalada: true })).toBe('ios-safari')
  expect(de(null, { instalada: true, puedeInstalar: true })).toBeNull()
})

test('la receta del atajo abre /compartir?url= de GiftR, y el route lo lleva a /agregar con el link: el contrato entre los dos', () => {
  const pasos = pasosAtajo('https://giftr.test')
  const conEntrada = pasos.filter((p) => p.includes('https://giftr.test/compartir?url='))
  expect(conEntrada).toHaveLength(1)
  expect(entradaAtajo('https://giftr.test')).toBe('https://giftr.test/compartir?url=')
  // lo que hace el atajo: la entrada más el link codificado (Codificar URL)
  for (const link of [ML, 'https://meli.la/1AbCdEf', 'https://www.instagram.com/p/DAbC123/?igsh=MWx0dGJmZ2V2ZnFhNg==']) {
    const r = GET(new Request(entradaAtajo('https://giftr.test') + encodeURIComponent(link)))
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`/agregar?link=${encodeURIComponent(link)}`)
  }
})

test('el pedido de instalar de Chrome: se guarda sin preventDefault, sirve una vez y se borra al instalar', async () => {
  const w = new EventTarget()
  const dejar = escucharPedidoInstalar(w as unknown as Window)
  const avisos = vi.fn()
  const dejarDeAvisar = alCambiarPedido(avisos)
  const pedido = (outcome: 'accepted' | 'dismissed') => Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }),
  }) as PedidoInstalar & { prompt: ReturnType<typeof vi.fn> }

  expect(puedeInstalar()).toBe(false)
  const p = pedido('accepted')
  w.dispatchEvent(p)
  // Chrome sigue ofreciendo instalar por su cuenta
  expect(p.defaultPrevented).toBe(false)
  expect(puedeInstalar()).toBe(true)
  expect(avisos).toHaveBeenCalledTimes(1)
  expect(await instalarGiftR()).toBe(true)
  expect(p.prompt).toHaveBeenCalledTimes(1)
  // prompt() anda una sola vez: el segundo toque no lo vuelve a llamar
  expect(puedeInstalar()).toBe(false)
  expect(await instalarGiftR()).toBe(false)
  expect(p.prompt).toHaveBeenCalledTimes(1)

  // dijo que no: false, y el botón se va hasta que Chrome vuelva a ofrecer
  w.dispatchEvent(pedido('dismissed'))
  expect(await instalarGiftR()).toBe(false)
  expect(puedeInstalar()).toBe(false)

  // sin gesto, prompt() tira: false
  const sinGesto = pedido('accepted')
  sinGesto.prompt.mockRejectedValueOnce(new DOMException('The prompt() method must be called with a user gesture', 'NotAllowedError'))
  w.dispatchEvent(sinGesto)
  expect(await instalarGiftR()).toBe(false)

  // instalada desde el menú de Chrome: el pedido guardado se va
  w.dispatchEvent(pedido('accepted'))
  expect(puedeInstalar()).toBe(true)
  w.dispatchEvent(new Event('appinstalled'))
  expect(puedeInstalar()).toBe(false)

  dejar()
  dejarDeAvisar()
  avisos.mockClear()
  w.dispatchEvent(pedido('accepted'))
  expect(puedeInstalar()).toBe(false)
  expect(avisos).not.toHaveBeenCalled()
})

test('el pedido que llega antes de hidratar lo atrapa el script del <head>, y escucharPedidoInstalar lo levanta una vez', async () => {
  // el script corre solo, como en el HTML: sin módulos ni nada de afuera más que window
  const pagina = (w: EventTarget) => runInNewContext(ATRAPAR_PEDIDO_INSTALAR, { window: w })
  const pedido = () => Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  }) as PedidoInstalar

  // llega mientras React hidrata: RegistrarSW todavía no escucha
  const w = new EventTarget() as EventTarget & { __pedidoInstalar?: PedidoInstalar | null }
  pagina(w)
  const p = pedido()
  w.dispatchEvent(p)
  expect(p.defaultPrevented).toBe(false)
  expect(puedeInstalar()).toBe(false)
  let dejar = escucharPedidoInstalar(w as unknown as Window)
  expect(puedeInstalar()).toBe(true)
  // usado, no vuelve aunque se vuelva a montar (StrictMode, Fast Refresh)
  expect(await instalarGiftR()).toBe(true)
  dejar()
  dejar = escucharPedidoInstalar(w as unknown as Window)
  expect(puedeInstalar()).toBe(false)
  // los de después llegan como siempre
  w.dispatchEvent(pedido())
  expect(puedeInstalar()).toBe(true)
  dejar()

  // si se instaló antes de hidratar, no queda nada
  guardarPedidoInstalar(null)
  const otra = new EventTarget()
  pagina(otra)
  otra.dispatchEvent(pedido())
  otra.dispatchEvent(new Event('appinstalled'))
  escucharPedidoInstalar(otra as unknown as Window)()
  expect(puedeInstalar()).toBe(false)

  // sin el script (la página de antes), igual
  escucharPedidoInstalar(new EventTarget() as unknown as Window)()
  expect(puedeInstalar()).toBe(false)
})

const EN_APP_SI = '[@media(display-mode:standalone)]:visible'
const EN_APP_NO = '[@media(display-mode:standalone)]:hidden'

/** Las variantes de Android, con sus clases (van todas en la misma celda para que no corra nada). */
const variantes = (html: string) =>
  [...html.matchAll(/<div class="col-start-1 row-start-1 flex flex-col gap-2([^"]*)">(.*?)<\/div>/g)].map((m) => ({ clases: m[1], html: m[2] }))

/** Lo que se ve de la sección en una pestaña de Android (las demás variantes están invisibles). */
function visible(html: string): string {
  const vistas = variantes(html).filter((v) => !v.clases.split(' ').includes('invisible'))
  expect(vistas).toHaveLength(1)
  return vistas[0].html
}

const pintar = (plataforma: Plataforma, atajo: string | null = null) =>
  renderToStaticMarkup(createElement(AgregarDesdeApps, { plataforma, base: 'https://giftr.test', atajo }))

test('la sección viene pintada desde el servidor: Android en una pestaña sin el ofrecimiento, con todas las variantes en su lugar', () => {
  const html = pintar('android')
  const vista = visible(html)
  expect(vista).toContain(TEXTOS_APPS['android-manual'].texto)
  expect(vista).toContain('⋮ → Instalar y crear acceso directo → Instalar')
  expect(vista).not.toContain('<button')
  // el botón y lo de instalada están, pero invisibles: cuando el navegador los muestra, la sección no cambia de alto
  expect(html).toContain(`>${TEXTOS_APPS['android-boton'].boton}</button>`)
  expect(html).toContain(TEXTOS_APPS['android-app'].texto)
  expect(html).not.toContain('<details')
})

test('en la GiftR instalada de Android, el CSS muestra lo suyo antes de hidratar y saca las otras variantes (sin hueco)', () => {
  const vs = variantes(pintar('android'))
  expect(vs).toHaveLength(4)
  // lo pinta el servidor como una pestaña, pero con display-mode: standalone gana "elegí GiftR"
  const app = vs.filter((v) => v.html.includes(TEXTOS_APPS['android-app'].texto))
  expect(app).toHaveLength(1)
  expect(app[0].clases.split(' ')).toEqual(expect.arrayContaining(['invisible', EN_APP_SI]))
  expect(app[0].clases).not.toContain(EN_APP_NO)
  // las otras tres, fuera del todo (display: none): ahí no llega el ofrecimiento de Chrome
  for (const v of vs.filter((x) => x !== app[0])) {
    expect(v.clases).toContain(EN_APP_NO)
    expect(v.clases).not.toContain(EN_APP_SI)
  }
})

test('iPhone sin el link del atajo: la receta abierta, con la dirección de GiftR entera para copiar; con el link, el botón', () => {
  const sin = pintar('ios')
  expect(sin).toContain(TEXTOS_APPS.ios.texto)
  expect(sin).toContain(TEXTOS_APPS.ios.chico)
  // la línea de Safari, solo en la GiftR de inicio: la muestra el CSS antes de pintar, sin correr nada ni dejar un hueco
  expect(sin).toContain(`<p class="text-[13px] font-medium leading-snug hidden [@media(display-mode:standalone)]:block">${TEXTOS_APPS['ios-app'].texto}</p>`)
  expect(sin).not.toContain('<a ')
  expect(sin).toContain('<details open=""')
  expect(sin).toContain(`>${TEXTOS_APPS.receta.sinAtajo}</summary>`)
  // la dirección, en su renglón y con Copiar (al lado del texto se cortaba en el guion de giftr-seven)
  expect(sin).toContain('<span class="mt-1 flex items-center gap-2"><code class="min-w-0 flex-1 select-all break-all font-sans font-bold">https://giftr.test/compartir?url=</code><button type="button"')
  expect(sin).toContain('>Copiar</span></button></span></li>')
  expect(sin.match(/<li>/g)).toHaveLength(pasosAtajo('').length)
  expect(sin).toContain(TEXTOS_APPS.receta.alFinal)

  const con = pintar('ios', 'https://www.icloud.com/shortcuts/abc123')
  expect(con).toContain(`<a href="https://www.icloud.com/shortcuts/abc123" class="gr-btn-primary gr-btn--sm w-full">${TEXTOS_APPS.ios.boton}</a>`)
  expect(con).toContain('<details class=')
  expect(con).not.toContain('<details open')
  expect(con).toContain(`>${TEXTOS_APPS.receta.conAtajo}</summary>`)
})
