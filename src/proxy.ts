import type { NextRequest } from 'next/server'

// Diagnóstico temporal del ícono de "Agregar a inicio" en iPhone: anota qué pide el teléfono
// (páginas, íconos, manifest) y con qué navegador, para ver en los logs de Vercel dónde se cae.
// No anota cookies ni IPs, solo si vino con cookie. Se saca cuando el ícono ande.
export function proxy(request: NextRequest) {
  const h = request.headers
  console.log('[visita]', JSON.stringify({
    m: request.method,
    path: request.nextUrl.pathname + request.nextUrl.search,
    ua: h.get('user-agent'),
    dest: h.get('sec-fetch-dest'),
    mode: h.get('sec-fetch-mode'),
    accept: h.get('accept'),
    purpose: h.get('sec-purpose') ?? h.get('purpose'),
    cookie: h.has('cookie'),
  }))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/|foto/|sw\\.js).*)'],
}
