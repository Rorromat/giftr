import { loCompartido, rutaAgregar } from '@/lib/recibir-compartido'

// Lo compartido a GiftR desde otra app (el share_target del manifest). Normalmente lo atiende el service worker
// (public/sw.js) y esto no se llama: llega acá si el SW no estaba (datos del sitio borrados, primera carga), si no pudo
// guardarlo, o por GET desde el atajo del iPhone. No mira la sesión, no guarda nada ni pone cookies: solo arma /agregar con
// el link o el texto (ahí se pide entrar si hace falta y se revisa todo de nuevo), como un link que llena un formulario.
// La foto no se toma: sin el SW no se puede achicar en el teléfono, un cuerpo de más de 4,5 MB ni llega (Vercel lo corta
// antes con un 413) y procesarla sería un efecto en un POST que cualquier sitio puede mandar; /agregar avisa que no llegó.

/**
 * 303: el navegador sigue a /agregar con GET (redirect() de next/navigation da 307 en un route, y repetiría el POST). La
 * ruta es relativa y la arma rutaAgregar: nunca a lo que vino, ni con el host que diga el pedido.
 */
const aAgregar = (ruta: string) => new Response(null, { status: 303, headers: { Location: ruta, 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const datos = await request.formData().catch(() => null)
  if (!datos) return aAgregar('/agregar')
  const conFoto = datos.getAll('foto').some((f) => typeof f !== 'string' && f.size > 0)
  const compartido = loCompartido({ title: datos.get('title'), text: datos.get('text'), url: datos.get('url') })
  return aAgregar(rutaAgregar({ compartido, sinFoto: conFoto }))
}

/** El atajo del iPhone (/compartir?url=…), o el service worker sin lugar para guardar (con title, text, url y foto=no). */
export function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const compartido = loCompartido({ title: q.get('title'), text: q.get('text'), url: q.get('url') })
  return aAgregar(rutaAgregar({ compartido, sinFoto: q.get('foto') === 'no' }))
}
