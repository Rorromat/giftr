import { linkQuePasa } from '@/lib/deseo-form'
import { esHostDeMercadoLibre, esUrlPublica, linkHttp, sitioDeLink, tituloDelLink } from '@/lib/links'
import type { Estado, RespuestaLink } from '@/lib/producto-del-link'

// Completar el formulario de un deseo desde el link del producto (CompletarDesdeLink): qué link se busca, qué se escribe
// en cada campo, qué se avisa y cuándo se pide. Sin React ni DOM para poder probarlo; corre en el navegador.

export type { RespuestaLink }

/** Lo escrito en los campos que se completan, tal cual. */
export type Valores = { titulo: string; linkTienda: string; precio: string }
/** Lo que escribió el autocompletado la última vez (y para qué link): eso se puede reemplazar; lo que escribió el dueño, no. */
export type Puesto = { link: string; titulo?: string; linkTienda?: string; precio?: string }
/** Lo que contestó la lectura: la respuesta, 'muchos' (el tope por usuario) o null (no contestó a tiempo, o sin red). */
export type Contestado = RespuestaLink | 'muchos' | null
/** Lo que se escribe en cada campo ('' lo vacía); lo que no viene no se toca. */
export type Campos = { titulo?: string; linkTienda?: string; precio?: string }
export type Completado = Campos & {
  /** La que se le propone a FotoField; null saca la que propuso otro link, si nadie la tocó. */
  foto: string | null
  /** La línea de estado (null: ninguna). */
  aviso: string | null
  puesto: Puesto
}

/** El cliente corta la lectura a los 9 s (el route tiene 10), y cuenta como que no cargó. */
export const LEER_LINK_MS = 9000
/** Lo escrito a mano espera a que deje de escribir; lo pegado se busca enseguida. */
export const ESPERA_ESCRITO_MS = 400

/**
 * El link del título que pasaría a "Link a la tienda" (y lo que queda del título), con la regla del servidor (ver
 * linkQuePasa): ese campo vacío o con el mismo link. El que puso ahí el autocompletado cuenta como vacío: pegar otro
 * producto en el título reemplaza al anterior.
 */
function delTitulo(v: Valores, puesto: Puesto | null) {
  const t = v.linkTienda.trim()
  const tienda = !t || t === puesto?.linkTienda ? null : linkHttp(t) ?? undefined
  return linkQuePasa(v.titulo.trim(), tienda)
}

/** "Link a la tienda" como link; null si está vacío o no es un link. */
const deLaTienda = (v: Valores) => linkHttp(v.linkTienda.trim())

/**
 * Qué link buscar: el del título si pasaría a la tienda; si no, el de "Link a la tienda" si es un link y no es el que ya
 * estaba guardado (al abrir la pantalla de editar no se pide nada); si no, ninguno. Uno que el servidor no va a buscar
 * (localhost, una IP, otro puerto) tampoco.
 */
export function linkParaCompletar(v: Valores, guardado: string | null, puesto: Puesto | null = null): string | null {
  const tienda = deLaTienda(v)
  const link = delTitulo(v, puesto)?.link ?? (tienda !== guardado ? tienda : null)
  return link && esUrlPublica(link.replace(/^http:\/\//i, 'https://')) ? link : null
}

export const AVISO_MUCHOS = 'Buscaste muchos links seguidos. Probá en un rato; mientras, completalo a mano.'
const AVISO_NO_CARGA = 'No pudimos abrir esa página. Completá lo que falte.'

export const avisoBuscando = (link: string) => `Buscando el producto en ${sitioDeLink(link)}…`

function avisoDe(r: Contestado, nombre: boolean, precio: boolean): string | null {
  if (r === 'muchos') return AVISO_MUCHOS
  if (!r || r.estado === 'no-carga') return AVISO_NO_CARGA
  switch (r.estado) {
    case 'ok': {
      // nombra solo lo que llenó (la foto avisa en FotoField); si todo estaba escrito, nada
      const que = [nombre && 'el nombre', precio && 'el precio'].filter(Boolean)
      return que.length ? `Completamos ${que.join(' y ')} desde ${r.sitio}. ${que.length > 1 ? 'Revisalos' : 'Revisalo'}.` : null
    }
    case 'bloqueado':
      return esHostDeMercadoLibre(r.sitio)
        ? `MercadoLibre no nos deja ver la publicación.${nombre ? ' Pusimos el nombre del link: revisalo.' : ''} Para la foto, copiala desde la app y tocá Pegar.`
        : `${r.sitio} no nos deja ver la página. Completá lo que falte.`
    case 'no-esta':
      return 'Esa publicación ya no existe. Fijate que el link sea el de ahora.'
    default:
      return 'No encontramos los datos del producto en esa página. Completá lo que falte.'
  }
}

/**
 * Qué escribir con lo que contestó la lectura de un link. Un campo se llena solo si está vacío o si sigue igual a lo que
 * puso el autocompletado antes (puesto): un segundo link reemplaza lo del primero, pero no lo que el dueño corrigió.
 * - Título: si era solo el link, el nombre de la respuesta (de la página o del link); sin nombre queda el link y el
 *   servidor pone el del link o el sitio. Con texto además del link ("Para mamá https://…"), el texto, sin el nombre.
 * - El link del título pasa a "Link a la tienda" ya acá, con la regla del servidor: al mandar no hay dos movimientos.
 * - Precio: solo ARS o USD (otra moneda viene null y no se pone).
 * - Lo que puso otro link y no trae este se vacía: el precio o el nombre de otro producto no son de este.
 * Sin respuesta (tiempo vencido, sin red, el tope) se usa el nombre que trae el link. Null si el link ya no es el que hay
 * que completar (lo borró o pegó otro mientras se buscaba): no se aplica nada.
 */
export function queCompletar(v: Valores, link: string, r: Contestado, puesto: Puesto | null): Completado | null {
  const enTitulo = delTitulo(v, puesto)
  if ((enTitulo?.link ?? deLaTienda(v)) !== link) return null
  const respuesta = r === 'muchos' ? null : r
  const nombre = respuesta ? respuesta.titulo : tituloDelLink(link)
  const precio = respuesta?.precio ?? null
  const foto = respuesta?.foto && esUrlPublica(respuesta.foto) ? respuesta.foto : null
  const c: Completado = { foto, aviso: null, puesto: { link } }
  const libre = (escrito: string, antes: string | undefined) => !escrito.trim() || escrito === antes

  let pusoNombre = false
  if (enTitulo) {
    if (v.linkTienda !== link) c.linkTienda = link
    c.puesto.linkTienda = link
    // con texto además del link queda el texto, salvo que sea el nombre que puso el link anterior (no es del dueño)
    const resto = enTitulo.resto === puesto?.titulo ? '' : enTitulo.resto
    if (resto) c.titulo = resto
    else if (nombre) pusoNombre = true
    // sin nombre queda el link solo (el servidor pone el del link o el sitio)
    else if (enTitulo.resto) c.titulo = link
  } else if (libre(v.titulo, puesto?.titulo)) {
    if (nombre) pusoNombre = true
    else if (v.titulo.trim()) c.titulo = ''
  }
  if (pusoNombre && nombre) {
    c.titulo = nombre
    c.puesto.titulo = nombre
  }

  let pusoPrecio = false
  if (libre(v.precio, puesto?.precio)) {
    if (precio) {
      c.precio = precio
      c.puesto.precio = precio
      pusoPrecio = true
    } else if (v.precio.trim()) c.precio = ''
  }
  c.aviso = avisoDe(r, pusoNombre, pusoPrecio)
  return c
}

/**
 * Al buscar un link distinto del que se completó antes, lo que puso ese y nadie tocó ya no es de este producto: se saca
 * enseguida, sin esperar la lectura. Si manda antes de que vuelva, no se guarda con el precio ni la foto del otro; y si el
 * link nuevo está en el título y en "Link a la tienda" quedó el anterior, ese también se saca: así el servidor mueve el
 * nuevo, y el título no avisa que es largo. Null si no hay nada que sacar.
 */
export function loDelAnterior(v: Valores, link: string, puesto: Puesto | null): (Campos & { foto: null }) | null {
  if (!puesto || puesto.link === link) return null
  const c: Campos & { foto: null } = { foto: null }
  if (v.titulo && v.titulo === puesto.titulo) c.titulo = ''
  if (v.linkTienda && v.linkTienda === puesto.linkTienda) c.linkTienda = ''
  if (v.precio && v.precio === puesto.precio) c.precio = ''
  return c
}

const ESTADOS: readonly string[] = ['ok', 'bloqueado', 'sin-datos', 'no-esta', 'no-carga'] satisfies Estado[]
const textoONull = (v: unknown): v is string | null => v === null || typeof v === 'string'

/** La respuesta de POST /api/deseo/link, si tiene la forma de RespuestaLink (si no, como si no hubiera contestado). */
export function respuestaLink(x: unknown): RespuestaLink | null {
  if (typeof x !== 'object' || x === null) return null
  const { estado, titulo, precio, foto, sitio } = x as Record<string, unknown>
  if (typeof estado !== 'string' || !ESTADOS.includes(estado) || typeof sitio !== 'string') return null
  if (!textoONull(titulo) || !textoONull(precio) || !textoONull(foto)) return null
  return { estado: estado as Estado, titulo, precio, foto, sitio }
}

/**
 * POST /api/deseo/link. undefined si no hay nada que hacer: sin sesión, o un link que el servidor no toma (el envío del
 * formulario se encarga). Un error de red o el corte tiran.
 */
export async function pedirLectura(link: string, signal: AbortSignal): Promise<Contestado | undefined> {
  const r = await fetch('/api/deseo/link', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: link }), signal,
  })
  if (r.status === 400 || r.status === 401) return undefined
  if (r.status === 429) return 'muchos'
  return r.ok ? respuestaLink(await r.json()) : null
}

export type Completador = {
  /** Cambió el título o "Link a la tienda"; pegado si lo trajo un pegado (no espera). */
  alCambiar: (pegado: boolean) => void
  /** El formulario se va: se corta lo que esté en curso. */
  cerrar: () => void
}

/**
 * Cuándo se pide la lectura y qué se hace con lo que vuelve. Un pegado se busca en el momento y lo escrito a mano, cuando
 * deja de escribir. Un pedido por vez: un link nuevo corta el anterior, y lo que llegue de ese se descarta. Lo que ya
 * se leyó no se vuelve a pedir (si se pega de nuevo, se vuelve a completar con eso), salvo que no haya cargado. Sin
 * reintentos. Nada de esto frena el envío.
 */
export function completador(o: {
  guardado: string | null
  leer: () => Valores
  /** Escribe los campos que vienen y, si viene foto (null incluido), se la propone a FotoField. */
  escribir: (campos: Campos, foto?: string | null) => void
  /** La línea de estado ('' la vacía). */
  mostrar: (aviso: string) => void
  pedir?: (link: string, signal: AbortSignal) => Promise<Contestado | undefined>
}): Completador {
  const pedir = o.pedir ?? pedirLectura
  const leidos = new Map<string, RespuestaLink>()
  let actual: string | null = null
  let puesto: Puesto | null = null
  let enCurso: { link: string; corte: AbortController } | null = null
  let espera: ReturnType<typeof setTimeout> | undefined

  function cortar() {
    clearTimeout(espera)
    enCurso?.corte.abort()
    enCurso = null
  }

  function aplicar(link: string, r: Contestado) {
    const v = o.leer()
    const c = linkParaCompletar(v, o.guardado, puesto) === link ? queCompletar(v, link, r, puesto) : null
    if (!c) return
    puesto = c.puesto
    o.escribir(c, c.foto)
    o.mostrar(c.aviso ?? '')
    // con lo escrito, el link a completar puede ser ninguno (el que estaba guardado, al editar)
    actual = linkParaCompletar(o.leer(), o.guardado, puesto)
  }

  async function buscar(link: string) {
    const leido = leidos.get(link)
    if (leido) return aplicar(link, leido)
    const antes = loDelAnterior(o.leer(), link, puesto)
    if (antes) o.escribir(antes, antes.foto)
    const pedido = { link, corte: new AbortController() }
    enCurso = pedido
    o.mostrar(avisoBuscando(link))
    const reloj = setTimeout(() => pedido.corte.abort(), LEER_LINK_MS)
    let r: Contestado | undefined
    try {
      r = await pedir(link, pedido.corte.signal)
    } catch {
      r = null
    } finally {
      clearTimeout(reloj)
    }
    // otro link, o el formulario se fue
    if (enCurso !== pedido) return
    enCurso = null
    if (r === undefined) return o.mostrar('')
    if (r && r !== 'muchos' && r.estado !== 'no-carga') leidos.set(link, r)
    aplicar(link, r)
  }

  return {
    alCambiar(pegado) {
      const link = linkParaCompletar(o.leer(), o.guardado, puesto)
      // el mismo link (escribió en otra parte del título): nada; pegado de nuevo, se completa otra vez si no se está buscando
      if (link === actual && (!pegado || !link || enCurso?.link === link)) return
      actual = link
      cortar()
      if (!link) return o.mostrar('')
      if (pegado) void buscar(link)
      else espera = setTimeout(() => void buscar(link), ESPERA_ESCRITO_MS)
    },
    cerrar() {
      cortar()
      actual = null
    },
  }
}
