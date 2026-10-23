import { expect, test, vi } from 'vitest'

// El route /compartir: el respaldo cuando el service worker no está (y la entrada del atajo del iPhone). Solo arma /agregar:
// ni la base ni la sesión (si las tocara, estos mocks tiran).
vi.mock('@/db', () => ({ get db() { throw new Error('el route de compartir no toca la base') } }))
vi.mock('@/auth', () => ({
  auth: () => { throw new Error('el route de compartir no mira la sesión') },
  signIn: () => { throw new Error('no') },
}))

import { GET, POST } from '@/app/compartir/route'

const ML = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-imperial-de-calabaza-_JM'
const URL_COMPARTIR = 'https://giftr.test/compartir'

function multipart(campos: Record<string, string | File>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return new Request(URL_COMPARTIR, { method: 'POST', body: fd })
}

test('POST con el texto de MercadoLibre y una foto: 303 relativo a /agregar con el link y foto=no, sin cachear', async () => {
  const r = await POST(multipart({ title: 'Mercado Libre', text: `Mirá este producto en Mercado Libre ${ML}`, foto: new File([new Uint8Array(100)], 'f.jpg', { type: 'image/jpeg' }) }))
  expect(r.status).toBe(303)
  expect(r.headers.get('location')).toBe(`/agregar?link=${encodeURIComponent(ML)}&foto=no`)
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(r.headers.get('set-cookie')).toBeNull()
  // solo un texto, y un archivo vacío no cuenta como foto
  const texto = await POST(multipart({ text: 'Mate de calabaza\ncon bombilla', foto: new File([], 'vacia.jpg', { type: 'image/jpeg' }) }))
  expect(texto.headers.get('location')).toBe('/agregar?texto=Mate+de+calabaza%0Acon+bombilla')
})

test('POST con un cuerpo que no se puede leer va a /agregar', async () => {
  const roto = new Request(URL_COMPARTIR, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: 'basura' })
  const r = await POST(roto)
  expect(r.status).toBe(303)
  expect(r.headers.get('location')).toBe('/agregar')
})

test('GET (el atajo del iPhone): ?url= va a /agregar?link=…; con solo un título de archivo, a /agregar', async () => {
  const r = GET(new Request(`${URL_COMPARTIR}?url=${encodeURIComponent(ML)}`))
  expect(r.status).toBe(303)
  expect(r.headers.get('location')).toBe(`/agregar?link=${encodeURIComponent(ML)}`)
  expect(GET(new Request(`${URL_COMPARTIR}?title=IMG_20261022_101010.jpg`)).headers.get('location')).toBe('/agregar')
  // lo que manda el service worker sin lugar para guardar
  const delSW = new URLSearchParams({ title: 'Mate | MercadoLibre', text: ML, url: '', foto: 'no' })
  expect(GET(new Request(`${URL_COMPARTIR}?${delSW}`)).headers.get('location')).toBe(`/agregar?link=${encodeURIComponent(ML)}&foto=no`)
})

test('nunca a otro lado: ni a lo que vino, ni con el host del pedido; javascript: no es un link', async () => {
  for (const r of [
    GET(new Request(`${URL_COMPARTIR}?url=${encodeURIComponent('https://otro.com/')}`, { headers: { host: 'otro.com' } })),
    GET(new Request(`${URL_COMPARTIR}?url=//otro.com`)),
    await POST(multipart({ url: 'https://otro.com/' })),
  ]) {
    const location = r.headers.get('location')!
    expect(location.startsWith('/agregar?link='), location).toBe(true)
    expect(new URL(location, 'https://giftr.test').origin).toBe('https://giftr.test')
  }
  expect(GET(new Request(`${URL_COMPARTIR}?url=javascript:alert(1)`)).headers.get('location')).toBe('/agregar')
})
