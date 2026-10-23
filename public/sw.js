// Service worker de GiftR: muestra los avisos push (codazos) y recibe lo que se comparte a GiftR desde otra app (el
// share_target del manifest). No cachea nada: lo compartido queda un rato en un buzón (Cache Storage) solo para que
// /agregar lo levante, y ahí se borra. Todo lo demás va a la red como si no hubiera service worker.

// El mismo nombre que en src/lib/buzon-compartido.ts (lo fija un test)
const BUZON = 'giftr-compartido'
// Más que eso no es una foto de teléfono; /agregar la achica a 1400 px antes de subirla
const FOTO_MAX_BYTES = 25_000_000
// Lo que se guarda de cada texto (un texto de 1 MB no se guarda entero)
const TEXTO_MAX = 5000
// Las mismas que acepta el manifest: Chrome ya descarta las demás, esto es por las dudas (un SVG, un PDF). Sin HEIC: Chrome
// no la puede achicar en el teléfono y el sharp del servidor no la lee (daría "No pudimos subir esa foto")
const FOTO = /^image\/(jpe?g|png|webp|gif|avif)$/i
// Lo que entra en la URL del respaldo, ya codificado: una más larga no llega (Vercel corta en unos 14 KB, y una letra con
// tilde ocupa 6 caracteres; un emoji, 12). El route usa el primer link (de hasta 2000), 120 letras de título y 500 de notas
const URL_MAX = 6000

self.addEventListener('install', (event) => {
  self.skipWaiting()
  // Con un handler de fetch, Chrome despierta al service worker en cada navegación: así los GET van directo a la red y ni
  // lo despiertan (Chrome 123+). Sin soporte, o si tira, no pasa nada: el handler de fetch los deja pasar igual.
  try {
    if (event.addRoutes) event.waitUntil(Promise.resolve(event.addRoutes({ condition: { requestMethod: 'GET' }, source: 'network' })).catch(() => {}))
  } catch { /* sin rutas: cada GET despierta al SW, que no lo contesta */ }
})

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  await sacarFotosSueltas()
  await self.clients.claim()
})()))

/**
 * Saca del buzón las fotos sin sus datos: quedan si recibir se cortó entre guardar la foto y guardar los datos. La página
 * no las toca, porque puede ser un compartir que se está guardando; al activarse eso no pasa, porque el SW anterior ya
 * terminó lo que estaba atendiendo. Lo que nadie levantó (compartió y no entró) lo saca la página pasado un día, cada vez
 * que se abre GiftR (limpiarBuzon, en src/lib/buzon-compartido.ts), y si no, el próximo compartir.
 */
async function sacarFotosSueltas() {
  try {
    const buzon = await caches.open(BUZON)
    const claves = (await buzon.keys()).map((p) => p.url)
    for (const clave of claves) {
      if (clave.endsWith('/foto') && !claves.includes(clave.slice(0, -'/foto'.length))) await buzon.delete(clave)
    }
  } catch { /* sin Cache Storage: no hay nada que limpiar */ }
}

// Solo el POST de compartir (ver el manifest). Sin respondWith, el navegador lo pide a la red como siempre.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'POST') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname !== '/compartir') return
  event.respondWith(recibir(request))
})

const texto = (v) => (typeof v === 'string' ? v.slice(0, TEXTO_MAX) : '')
// Lo que ocupa en la URL, como lo codifica URLSearchParams (que no tira con un emoji cortado al medio, como encodeURIComponent)
const enUrl = (s) => new URLSearchParams({ s }).toString().length - 2

/**
 * Los textos para la URL del respaldo, en el orden en que el route busca el link (url, text, title), hasta URL_MAX entre
 * todos. Por palabras enteras: un link cortado sería otro link, que se buscaría y se guardaría roto.
 */
function paraLaUrl(campos) {
  let queda = URL_MAX
  const r = {}
  for (const k of ['url', 'text', 'title']) {
    let v = ''
    for (const pedazo of campos[k].split(/(\s+)/)) {
      const n = enUrl(pedazo)
      if (n > queda) break
      v += pedazo
      queda -= n
    }
    r[k] = v
  }
  return r
}
// 303: el navegador sigue con GET. Absoluta: Response.redirect no toma una ruta relativa en todos lados
const a = (ruta) => Response.redirect(new URL(ruta, self.location.origin).href, 303)

/**
 * Guarda lo compartido (los textos y la primera foto que sirva) en el buzón con un id al azar y manda a
 * /agregar?compartido=<id>: el link no viaja en la URL (ni en la vuelta después de entrar con Google) y la foto se sube
 * desde la página como cualquier otra (achicada y al cupo), sin pasar por el tope de tamaño del servidor. Si no se puede
 * guardar, los textos van por la URL al route /compartir, sin la foto.
 */
async function recibir(request) {
  let datos
  try {
    datos = await request.formData()
  } catch {
    return a('/agregar')
  }
  const campos = { title: texto(datos.get('title')), text: texto(datos.get('text')), url: texto(datos.get('url')) }
  // varias fotos: va la primera que sirva, y las demás se ignoran
  const archivos = datos.getAll('foto').filter((f) => typeof f !== 'string' && f.size > 0)
  const foto = archivos.find((f) => FOTO.test(f.type) && f.size <= FOTO_MAX_BYTES) || null
  try {
    const id = crypto.randomUUID()
    const buzon = await caches.open(BUZON)
    // uno por vez: lo de un compartir anterior que nadie levantó se va
    await Promise.all((await buzon.keys()).map((p) => buzon.delete(p)))
    // la foto antes que los datos: la página nunca ve "hay foto" sin la foto
    if (foto) await buzon.put(`/compartido/${id}/foto`, new Response(foto, { headers: { 'content-type': foto.type } }))
    const sobre = { ...campos, foto: !!foto, fotoRechazada: archivos.length > 0 && !foto, en: Date.now() }
    await buzon.put(`/compartido/${id}`, new Response(JSON.stringify(sobre), { headers: { 'content-type': 'application/json' } }))
    return a(`/agregar?compartido=${id}`)
  } catch {
    // sin lugar (o sin Cache Storage): los textos por la URL (lo que entra), que arma y revisa el servidor; la foto no
    return a(`/compartir?${new URLSearchParams({ ...paraLaUrl(campos), ...(archivos.length ? { foto: 'no' } : {}) })}`)
  }
}

self.addEventListener('push', (event) => {
  let aviso = {}
  try {
    aviso = event.data ? event.data.json() : {}
  } catch {
    aviso = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(self.registration.showNotification(aviso.title || 'GiftR', {
    body: aviso.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'giftr-codazo',
    renotify: true,
    data: { url: aviso.url || '/' },
  }))
})

// Al tocar el aviso: si GiftR ya está abierto, lo trae adelante en esa pantalla; si no, lo abre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const v of ventanas) {
      if (new URL(v.url).origin !== self.location.origin) continue
      try { await v.navigate(url) } catch { /* una ventana que no controla este SW no se puede navegar */ }
      return v.focus()
    }
    return self.clients.openWindow(url)
  })())
})
