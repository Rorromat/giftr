import { linkQuePasa } from '@/lib/deseo-form'
import { esHome, esHostDeMercadoLibre, esUrlPublica, linkEnTexto, linkHttp, sitioDeLink, tituloDelLink } from '@/lib/links'
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
/** Lo que se muestra. */
export type Linea = {
  /** La línea de estado ('' la vacía): una sola línea, con su lugar guardado. */
  aviso: string
  /** Cómo poner la foto si no se pudo traer: lo dice FotoField al lado de Pegar, y solo si no hay una. */
  consejoFoto?: string
}
export type Completado = Campos & {
  /** La que se le propone a FotoField; null saca la que propuso otro link, si nadie la tocó. */
  foto: string | null
  /** La línea de estado (null: ninguna). */
  aviso: string | null
  consejoFoto?: string
  puesto: Puesto
}

/** El cliente corta la lectura a los 9 s (el route tiene 10), y cuenta como que no cargó. */
export const LEER_LINK_MS = 9000
/**
 * Lo escrito a mano se busca cuando deja de escribir un rato, o al dejar el campo; lo pegado, enseguida. Con una pausa
 * corta salía un pedido por cada pedazo del link que se escribe en el teléfono ("lacasadelmate.com", "….com.ar/producto"),
 * y cada uno gasta el tope.
 */
export const ESPERA_ESCRITO_MS = 1500

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

/** El link de un texto pegado: entero (con o sin https://) o adentro de otro texto ("Mirá este mate https://…"). */
const linkDelTexto = (t: string) => linkHttp(t.trim()) ?? linkEnTexto(t)?.link ?? null

/** El título de un deseo que es solo ese link, como lo pone el servidor (ver deseoDesdeForm). */
const nombreDelLink = (link: string) => tituloDelLink(link) ?? sitioDeLink(link)

/**
 * Lo que agregan los links para saber de dónde vino la visita (MercadoLibre, Google, Meta, los mails de las tiendas): no
 * cambia el producto. Uno que no está acá cuenta como del producto: a lo sumo se lee de nuevo.
 */
const DE_SEGUIMIENTO =
  /^(?:(?:utm|matt|reco|c|aff|gad)_.*|tracking_id|deal_print_id|polycard_client|gclid|gbraid|wbraid|fbclid|msclkid|igshid|srsltid|ttclid|_gl|mc_cid|mc_eid|spm|ref_)$/i

/**
 * Si dos links son del mismo producto: el mismo sitio y camino, sin mirar el #… ni lo que se agrega para seguir de dónde
 * vino (el tracking_id de MercadoLibre, los utm_…), y el resto del ?… igual, en los dos sentidos. Un valor distinto es
 * otro producto aunque sea un pedazo del otro (?id=124 y ?id=1245, ?product=mate y ?product=mate-grande).
 */
export function mismoProducto(uno: string, otro: string): boolean {
  let a: URL, b: URL
  try {
    a = new URL(uno)
    b = new URL(otro)
  } catch {
    return false
  }
  const camino = (u: URL) => u.pathname.replace(/\/+$/, '')
  const delProducto = (u: URL) => [...u.searchParams].filter(([k]) => !DE_SEGUIMIENTO.test(k)).map((par) => JSON.stringify(par)).sort().join()
  return a.host === b.host && camino(a) === camino(b) && delProducto(a) === delProducto(b)
}

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

export const AVISO_MUCHOS = 'Buscaste muchos links. Probá en un rato.'
const AVISO_NO_CARGA = 'No pudimos abrir esa página.'

export const avisoBuscando = (link: string) => `Buscando el producto en ${sitioDeLink(link)}…`

/**
 * Para una publicación de MercadoLibre que no se deja ver: lo dice FotoField al lado de Pegar, si no hay foto (ahí entra
 * en el alto de los botones; que es de MercadoLibre lo dice la línea).
 */
export const CONSEJO_FOTO_ML = 'Copiá la foto desde la app y tocá Pegar.'

// Cortos, para que entren en la línea (una sola, con su lugar guardado) en un teléfono de 320 px: unas 40 letras. Lo que
// falta completar se ve en los campos.
function avisoDe(r: Contestado, nombre: boolean, precio: boolean): string | null {
  if (r === 'muchos') return AVISO_MUCHOS
  if (!r || r.estado === 'no-carga') return AVISO_NO_CARGA
  const ml = esHostDeMercadoLibre(r.sitio)
  switch (r.estado) {
    case 'ok': {
      // nombra solo lo que llenó (la foto avisa en FotoField); si todo estaba escrito, nada
      if (nombre && precio) return 'Completamos nombre y precio: revisalos.'
      return nombre || precio ? `Completamos el ${nombre ? 'nombre' : 'precio'}: revisalo.` : null
    }
    case 'bloqueado':
      // el nombre del link ya se ve en el campo, y cómo poner la foto va al lado de Pegar (CONSEJO_FOTO_ML)
      return ml ? 'MercadoLibre no deja ver la publicación.' : 'La tienda no deja ver la página.'
    case 'no-esta':
      return `Esa ${ml ? 'publicación' : 'página'} ya no existe: revisá el link.`
    default:
      return 'No encontramos los datos en esa página.'
  }
}

/**
 * Qué escribir con lo que contestó la lectura de un link. Un campo se llena solo si está vacío o si sigue igual a lo que
 * puso el autocompletado antes (puesto): un segundo link reemplaza lo del primero, pero no lo que el dueño corrigió.
 * - Título: si era solo el link, el nombre de la respuesta (de la página o del link); sin nombre queda el link y el
 *   servidor pone el del link o el sitio. Con texto además del link ("Para mamá https://…"), el texto, sin el nombre.
 * - El link del título pasa a "Link a la tienda" ya acá, con la regla del servidor: al mandar no hay dos movimientos.
 * - Precio: solo ARS o USD (otra moneda viene null y no se pone).
 * - Lo que puso otro link y no trae este se vacía: el precio o el nombre de otro producto no son de este. El título no
 *   queda vacío (frenaría el envío): sin nombre, el del link o el sitio, como lo pondría el servidor.
 * Sin respuesta (tiempo vencido, sin red, el tope) se usa el nombre que trae el link. Null si el link ya no es el que hay
 * que completar (lo borró o pegó otro mientras se buscaba): no se aplica nada. escribiendo: el dueño está en el título;
 * lo que escribe al lado del link no se toca (le cambiaría lo que está escribiendo y le movería el cursor).
 */
export function queCompletar(v: Valores, link: string, r: Contestado, puesto: Puesto | null, escribiendo = false): Completado | null {
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
    // si está escribiendo ahí, el título queda como está: el link ya está en la tienda, así que al mandar sale del
    // título (y se saca al dejar el campo, ver completador)
    if (resto) {
      if (!escribiendo) c.titulo = resto
    } else if (nombre) pusoNombre = true
    // sin nombre queda el link solo (el servidor pone el del link o el sitio)
    else if (enTitulo.resto) c.titulo = link
  } else if (libre(v.titulo, puesto?.titulo)) {
    if (nombre) pusoNombre = true
    else if (v.titulo.trim()) {
      c.puesto.titulo = nombreDelLink(link)
      if (v.titulo !== c.puesto.titulo) c.titulo = c.puesto.titulo
    }
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
  if (respuesta?.estado === 'bloqueado' && esHostDeMercadoLibre(respuesta.sitio)) c.consejoFoto = CONSEJO_FOTO_ML
  return c
}

/**
 * Al buscar otro producto, lo que puso el link anterior y nadie tocó ya no es de este: se saca enseguida, sin esperar la
 * lectura, así quien manda antes de que vuelva no lo guarda con el nombre, el precio ni la foto del otro. El título no
 * queda vacío, que frenaría el envío: con el link nuevo en "Link a la tienda", va el nombre que trae ese link (o el sitio),
 * que la respuesta reemplaza; con el link nuevo pegado al lado del nombre anterior, queda el link solo (al mandar, el
 * servidor pone el nombre del link). Si en "Link a la tienda" quedó el anterior, se saca: así el servidor mueve el nuevo,
 * y el título no avisa que es largo. Con el mismo producto (el link sin el #… o el ?… de seguimiento) no se saca nada.
 * Null si no hay nada que sacar; si no, lo que se escribe (y la foto propuesta se saca) y lo que queda puesto.
 */
export function loDelAnterior(v: Valores, link: string, puesto: Puesto | null): { campos: Campos; puesto: Puesto } | null {
  if (!puesto || puesto.link === link || mismoProducto(link, puesto.link)) return null
  const campos: Campos = {}
  const nuevo: Puesto = { link }
  const enTitulo = delTitulo(v, puesto)
  if (enTitulo?.link === link) {
    if (enTitulo.resto && enTitulo.resto === puesto.titulo) campos.titulo = link
  } else if (v.titulo.trim() && v.titulo === puesto.titulo) {
    campos.titulo = nuevo.titulo = nombreDelLink(link)
  }
  const tienda = v.linkTienda.trim()
  if (tienda && tienda === puesto.linkTienda) campos.linkTienda = ''
  if (v.precio.trim() && v.precio === puesto.precio) campos.precio = ''
  return { campos, puesto: nuevo }
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
  /** Cambió el título o "Link a la tienda". pegado: el texto que trajo, si fue un pegado (null si se escribió). */
  alCambiar: (pegado: string | null) => void
  /** Dejó uno de esos dos campos. */
  alDejar: () => void
  /** El formulario se manda o se va: se corta lo que esté en curso, y lo que llegue tarde ya no se aplica. */
  cerrar: () => void
}

/**
 * Cuándo se pide la lectura y qué se hace con lo que vuelve. Un pegado que trae el link se busca en el momento; lo escrito
 * a mano, cuando deja de escribir un rato o deja el campo; la home de una tienda, nunca (no tiene un producto, y el
 * servidor contesta sin-datos). Un pedido por vez: un link nuevo corta el anterior, y lo que llegue de ese se descarta.
 * Lo que ya se leyó no se vuelve a pedir (si se pega de nuevo, se vuelve a completar con eso), salvo que no haya cargado;
 * el mismo producto (ver mismoProducto), tampoco. El link leído a medio borrar a mano no se busca. Sin reintentos. Nada de
 * esto frena el envío.
 */
export function completador(o: {
  guardado: string | null
  leer: () => Valores
  /** Si el dueño está en el título: lo que escribe al lado del link no se toca hasta que lo deje (ver queCompletar). */
  escribiendo?: () => boolean
  /** Escribe los campos que vienen y, si viene foto (null incluido), se la propone a FotoField. */
  escribir: (campos: Campos, foto?: string | null) => void
  mostrar: (linea: Linea) => void
  pedir?: (link: string, signal: AbortSignal) => Promise<Contestado | undefined>
}): Completador {
  const pedir = o.pedir ?? pedirLectura
  const leidos = new Map<string, RespuestaLink>()
  let actual: string | null = null
  let puesto: Puesto | null = null
  let enCurso: { link: string; corte: AbortController } | null = null
  let espera: { link: string; reloj: ReturnType<typeof setTimeout> } | null = null

  /** Lo que esperaba y lo que se estaba buscando, cortado; si decía "Buscando…", ya no (no se busca nada). */
  function cortar() {
    if (espera) clearTimeout(espera.reloj)
    espera = null
    if (!enCurso) return
    enCurso.corte.abort()
    enCurso = null
    o.mostrar({ aviso: '' })
  }

  function aplicar(link: string, r: Contestado) {
    const v = o.leer()
    const c = linkParaCompletar(v, o.guardado, puesto) === link ? queCompletar(v, link, r, puesto, o.escribiendo?.()) : null
    if (!c) return
    puesto = c.puesto
    o.escribir(c, c.foto)
    o.mostrar({ aviso: c.aviso ?? '', consejoFoto: c.consejoFoto })
    // con lo escrito, el link a completar puede ser ninguno (el que estaba guardado, al editar)
    actual = linkParaCompletar(o.leer(), o.guardado, puesto)
  }

  /** Lo que puso el link anterior y nadie tocó, afuera (ver loDelAnterior), con la foto que propuso. */
  function sacarLoDelAnterior(link: string) {
    const antes = loDelAnterior(o.leer(), link, puesto)
    if (!antes) return
    puesto = antes.puesto
    o.escribir(antes.campos, null)
  }

  /**
   * Con el link en "Link a la tienda" y el título vacío, mientras se lee: el nombre que trae el link (o el sitio), que la
   * respuesta reemplaza. Vacío, "Agregar" quedaba frenado ("Completá este campo") hasta que volviera, 9 s como mucho.
   */
  function nombreMientrasBusca(link: string) {
    const v = o.leer()
    if (v.titulo.trim() || deLaTienda(v) !== link) return
    const titulo = nombreDelLink(link)
    puesto = { ...(puesto ?? { link }), titulo }
    o.escribir({ titulo })
  }

  /** Lo ya leído de ese link, o del mismo producto. */
  const yaLeido = (link: string) =>
    leidos.get(link) ?? (puesto && mismoProducto(link, puesto.link) ? leidos.get(puesto.link) : undefined)

  /** El link que está completo en el formulario: el último que se leyó y aplicó. */
  const leidoPuesto = () => (puesto && leidos.has(puesto.link) ? puesto.link : null)

  /**
   * pegado: si vino de un pegado. Lo escrito al final del link leído (una letra de más) puede ser el mismo producto: no
   * saca nada antes de que vuelva la lectura, que decide (si no, se vaciaba todo y, al volver igual, se importaba otra vez
   * la foto).
   */
  async function buscar(link: string, pegado: boolean) {
    espera = null
    const leido = yaLeido(link)
    if (leido) {
      leidos.set(link, leido)
      return aplicar(link, leido)
    }
    const antes = leidoPuesto()
    if (pegado || !antes || !link.startsWith(antes)) sacarLoDelAnterior(link)
    nombreMientrasBusca(link)
    const pedido = { link, corte: new AbortController() }
    enCurso = pedido
    o.mostrar({ aviso: avisoBuscando(link) })
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
    if (r === undefined) return o.mostrar({ aviso: '' })
    if (r && r !== 'muchos' && r.estado !== 'no-carga') leidos.set(link, r)
    aplicar(link, r)
  }

  return {
    alCambiar(pegado) {
      const v = o.leer()
      const link = linkParaCompletar(v, o.guardado, puesto)
      // lo pegado trae ese link (y no es un texto pegado al lado de uno que ya estaba)
      const trajo = !!link && pegado !== null && linkDelTexto(pegado) === link
      // el mismo link: nada (escribió o pegó otra cosa); pegado de nuevo, se completa otra vez si no se está buscando
      if (link === actual && !(trajo && enCurso?.link !== link)) return
      actual = link
      cortar()
      if (!link) {
        // volvió al link guardado (al editar): lo que puso el otro y nadie tocó no es de este
        if (o.guardado && deLaTienda(v) === o.guardado) sacarLoDelAnterior(o.guardado)
        return o.mostrar({ aviso: '' })
      }
      if (esHome(link)) return o.mostrar({ aviso: '' })
      // el mismo producto con el link a la tienda recortado a mano: ya está completo, no se pide ni se vuelve a llenar
      const leido = puesto && !trajo && !delTitulo(v, puesto) && mismoProducto(link, puesto.link) ? leidos.get(puesto.link) : undefined
      if (puesto && leido) {
        leidos.set(link, leido)
        puesto = { ...puesto, link, ...(puesto.linkTienda ? { linkTienda: v.linkTienda.trim() } : {}) }
        return
      }
      // A mano, el link leído a medio borrar (un pedazo del principio): lo está borrando o cambiando, no es otro producto.
      // Ni se busca ni se saca nada: al parar o al dejar el campo (por ejemplo para tocar "Agregar"), el pedazo se buscaba,
      // gastaba el tope y sacaba el nombre, el precio y la foto que el dueño ya había aceptado. Lo que escriba después que
      // ya no sea un pedazo, o un pegado, sí se busca.
      if (!trajo && leidoPuesto()?.startsWith(link) && !leidos.has(link)) return
      if (trajo) void buscar(link, true)
      else espera = { link, reloj: setTimeout(() => void buscar(link, false), ESPERA_ESCRITO_MS) }
    },
    alDejar() {
      // lo escrito que esperaba se busca ya
      if (espera) {
        clearTimeout(espera.reloj)
        void buscar(espera.link, false)
      }
      // el link que quedó en el título mientras escribía al lado (ver queCompletar) ya está en la tienda: se saca
      const v = o.leer()
      const t = linkEnTexto(v.titulo)
      if (t?.resto && t.link === puesto?.linkTienda && v.linkTienda.trim() === t.link) o.escribir({ titulo: t.resto })
    },
    cerrar: cortar,
  }
}
