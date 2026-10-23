import { linkQuePasa } from '@/lib/deseo-form'
import { esHome, esHostDeMercadoLibre, esUrlPublica, linkEnTexto, linkHttp, sitioDeLink, tituloDelLink } from '@/lib/links'
import type { Estado, RespuestaLink } from '@/lib/producto-del-link'

// Completar el formulario de un deseo desde el link del producto (CompletarDesdeLink): qué link se busca, qué se escribe
// en cada campo, qué se avisa y cuándo se pide. Sin React ni DOM para poder probarlo; corre en el navegador.

export type { RespuestaLink }

/** Lo escrito en los campos que se completan, tal cual. */
export type Valores = { titulo: string; linkTienda: string; precio: string }
/** Uno de esos campos. */
export type Campo = keyof Valores
const CAMPOS: readonly Campo[] = ['titulo', 'linkTienda', 'precio']
/**
 * Lo que escribió el autocompletado la última vez (y para qué link): eso se puede reemplazar; lo que escribió el dueño, no.
 * tituloDe: el link de otro producto que puso ese título (quedó porque el dueño estaba en el título, ver loDelAnterior);
 * sin él, el título es de este link.
 */
export type Puesto = { link: string; titulo?: string; tituloDe?: string; linkTienda?: string; precio?: string }
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
  /** La que se le propone a FotoField (null saca la que propuso otro link, si nadie la tocó); sin foto, no se propone nada. */
  foto?: string | null
  /** La línea de estado (null: ninguna). */
  aviso: string | null
  consejoFoto?: string
  puesto: Puesto
  /** Lo que no se escribió porque el dueño está en ese campo: se escribe al dejarlo (ver completador). */
  retenidos?: Campo[]
}

/** El cliente corta la lectura a los 9 s (el route tiene 10), y cuenta como que no cargó. */
export const LEER_LINK_MS = 9000

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

/** El link del formulario: el del título si pasaría a la tienda; si no, el de "Link a la tienda"; si no, ninguno. */
const linkDelForm = (v: Valores, puesto: Puesto | null) => delTitulo(v, puesto)?.link ?? deLaTienda(v)

/**
 * Si lo pegado trae ese link: entero (con o sin https://) o adentro de otro texto ("Mirá este mate https://…"), con o
 * sin la puntuación de la oración al final ("…/mate-imperial."): en el título se toma sin ella (linkEnTexto) y en "Link a
 * la tienda", tal cual (linkHttp), como el servidor.
 */
export const traeElLink = (pegado: string, link: string) => linkHttp(pegado.trim()) === link || linkEnTexto(pegado)?.link === link

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
 * Qué link buscar: el del título si pasaría a la tienda; si no, el de "Link a la tienda"; si no, ninguno. Al editar, los
 * que ya tenía el deseo (guardados: el de la tienda y el que estaba en el título) no se buscan: al abrir la pantalla, o
 * al corregir una letra del título, no se pide nada. Uno que el servidor no va a buscar (localhost, una IP, otro puerto)
 * tampoco.
 */
export function linkParaCompletar(v: Valores, guardados: readonly string[], puesto: Puesto | null = null): string | null {
  const link = linkDelForm(v, puesto)
  return link && !guardados.includes(link) && esUrlPublica(link.replace(/^http:\/\//i, 'https://')) ? link : null
}

/** Los links que ya tenía el deseo que se edita (el de la tienda y el del título), que no se buscan. */
export function linksGuardados(linkTienda: string | null, titulo: string | null): string[] {
  return [linkTienda, linkEnTexto(titulo ?? '')?.link ?? null].filter((l): l is string => !!l)
}

export const AVISO_MUCHOS = 'Buscaste muchos links. Probá en un rato.'
const AVISO_NO_CARGA = 'No pudimos abrir esa página.'

export const avisoBuscando = (link: string) => `Buscando el producto en ${sitioDeLink(link)}…`

/**
 * Para una publicación de MercadoLibre que no se deja ver: lo dice FotoField al lado de Pegar, si no hay foto (ahí entra
 * en el alto de los botones; que es de MercadoLibre lo dice la línea).
 */
export const CONSEJO_FOTO_ML = 'Copiá la foto desde la app y tocá Pegar.'

const esOk = (r: Contestado) => (r !== null && r !== 'muchos' && r.estado === 'ok' ? r : null)

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
 * Qué escribir con lo que contestó la lectura de un link. Lo que escribió el dueño no se toca; lo vacío se llena.
 * - Título: si era solo el link (con espacios o no), vacío o lo que puso el autocompletado, el nombre de la respuesta
 *   (de la página o del link); sin nombre, el link queda y el servidor pone el del link o el sitio, y uno vacío lleva
 *   eso mismo (vacío frenaría el envío). Con texto además del link ("Para mamá https://…"), el texto, sin el nombre.
 * - El link del título pasa a "Link a la tienda" ya acá, con la regla del servidor: al mandar no hay dos movimientos.
 * - Precio y foto: solo con 'ok'. El precio (solo ARS o USD: otra moneda viene null) va si está vacío o si sigue igual a
 *   lo que puso el autocompletado, y si este producto no tiene, eso se vacía. Una falla (sin respuesta, el tope, no
 *   carga, no está, sin datos, bloqueado) no dice nada del producto: no vacía nada ni propone foto, solo pone el nombre
 *   del link en el título y avisa.
 * enfocado: el campo donde está el dueño. Ese no se toca (le cambiaría lo que escribe y le movería el cursor: "$88.990"
 * y lo que tipeaba quedaba "$88.99045000"): queda en retenidos y se escribe al dejarlo (ver completador). El link que sale
 * del título va con el título: si hay que escribirlo en la tienda y ahí está el foco, esperan los dos (si no, quedaba dos
 * veces al pegarlo ahí, o en ningún lado); con el foco en el título pasa a la tienda igual, y el título queda con el link
 * (el servidor lo saca, es el mismo).
 * Null si el link ya no es el que hay que completar (lo borró o pegó otro mientras se buscaba): no se aplica nada.
 * pegadoConElLink: el texto que vino pegado junto con el link ("Mirá este producto en Mercado Libre" de la app); no lo
 * escribió el dueño, así que en el título va el nombre.
 */
export function queCompletar(
  v: Valores, link: string, r: Contestado, puesto: Puesto | null, enfocado: Campo | null = null, pegadoConElLink: string | null = null,
): Completado | null {
  const enTitulo = delTitulo(v, puesto)
  if ((enTitulo?.link ?? deLaTienda(v)) !== link) return null
  const ok = esOk(r)
  // sin respuesta (tiempo vencido, sin red, el tope), el nombre que trae el link
  const nombre = r && r !== 'muchos' ? r.titulo : tituloDelLink(link)
  // lo que va en cada campo, y lo que de eso es del autocompletado
  const campos: Campos = {}
  const nuevo: Puesto = { link }
  if (enTitulo) {
    if (v.linkTienda !== link) campos.linkTienda = link
    nuevo.linkTienda = link
    // con texto además del link queda el texto, salvo que sea lo que puso el autocompletado o lo que vino pegado con el
    // link (no es del dueño)
    const resto = enTitulo.resto === puesto?.titulo || enTitulo.resto === pegadoConElLink ? '' : enTitulo.resto
    if (resto) campos.titulo = resto
    else if (nombre) campos.titulo = nuevo.titulo = nombre
    // sin nombre queda el link solo (el servidor pone el del link o el sitio)
    else if (enTitulo.resto) campos.titulo = link
  } else {
    // el link de la tienda que puso el autocompletado y sigue ahí, también
    if (puesto?.linkTienda && v.linkTienda.trim() === puesto.linkTienda) nuevo.linkTienda = puesto.linkTienda
    // vacío frenaría el envío: sin nombre, el del link o el sitio, como lo pondría el servidor
    if (!v.titulo.trim() || v.titulo === puesto?.titulo) campos.titulo = nuevo.titulo = nombre ?? nombreDelLink(link)
  }
  if (ok && (!v.precio.trim() || v.precio === puesto?.precio)) {
    if (ok.precio) campos.precio = nuevo.precio = ok.precio
    else if (v.precio.trim()) campos.precio = ''
  }

  const retenidos: Campo[] = enfocado === 'linkTienda' && campos.linkTienda !== undefined ? ['titulo', 'linkTienda'] : enfocado ? [enfocado] : []
  const c: Completado = { aviso: null, puesto: nuevo }
  for (const k of CAMPOS) {
    // queda como está, y lo que había puesto ahí el autocompletado sigue siendo suyo
    if (retenidos.includes(k)) nuevo[k] = puesto?.[k]
    else if (campos[k] !== undefined) c[k] = campos[k]
  }
  if (retenidos.includes('titulo')) nuevo.tituloDe = puesto?.tituloDe
  if (retenidos.length) c.retenidos = retenidos
  if (ok) c.foto = ok.foto && esUrlPublica(ok.foto) ? ok.foto : null
  c.aviso = avisoDe(r, !!nombre && c.titulo !== undefined && nuevo.titulo === nombre, !!c.precio)
  if (r && r !== 'muchos' && r.estado === 'bloqueado' && esHostDeMercadoLibre(r.sitio)) c.consejoFoto = CONSEJO_FOTO_ML
  return c
}

/**
 * El título sin lo que puso ahí el autocompletado para otro link: el link solo si está al lado (al mandar, el servidor
 * pone el nombre del link), o el nombre del link (o el sitio) si era todo el título, que no puede quedar vacío.
 * Undefined si no está.
 */
function tituloSinLoPuesto(v: Valores, link: string, puesto: Puesto): string | undefined {
  if (!puesto.titulo) return undefined
  const enTitulo = delTitulo(v, puesto)
  if (enTitulo?.link === link) return enTitulo.resto === puesto.titulo ? link : undefined
  return v.titulo === puesto.titulo ? nombreDelLink(link) : undefined
}

/**
 * Al buscar otro producto (un link que no es mismoProducto del anterior), lo que puso el link anterior y nadie tocó ya no
 * es de este: se saca enseguida, sin esperar la lectura, así quien manda antes de que vuelva no lo guarda con el nombre,
 * el precio ni la foto del otro. Siempre, aunque el link nuevo empiece con el anterior. El título no queda vacío, que
 * frenaría el envío (ver tituloSinLoPuesto). Si en "Link a la tienda" quedó el anterior, se saca: así el servidor mueve
 * el nuevo, y el título no avisa que es largo. escribiendo: el dueño está en el título (o va a estar), que no se toca;
 * lo del anterior que queda ahí sigue como puesto, marcado como de su link (tituloDe), y se cambia al dejarlo.
 * Null si no hay nada que sacar; si no, lo que se escribe (y la foto propuesta se saca) y lo que queda puesto.
 */
export function loDelAnterior(v: Valores, link: string, puesto: Puesto | null, escribiendo = false): { campos: Campos; puesto: Puesto } | null {
  if (!puesto || puesto.link === link || mismoProducto(link, puesto.link)) return null
  const campos: Campos = {}
  const nuevo: Puesto = { link }
  const titulo = tituloSinLoPuesto(v, link, puesto)
  if (titulo !== undefined && escribiendo) {
    nuevo.titulo = puesto.titulo
    // si volvió al producto que lo puso, es de este
    const de = puesto.tituloDe ?? puesto.link
    if (!mismoProducto(de, link)) nuevo.tituloDe = de
  } else if (titulo !== undefined) {
    campos.titulo = titulo
    if (titulo !== link) nuevo.titulo = titulo
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

/**
 * Lo que entró de una vez en un campo (del evento input): lo pegado (casi todos los navegadores lo dan en data; si no,
 * lo tiene el paste de antes, pegadoAntes) o lo que el teclado escribió de una vez, como el link que se toca en la tira
 * del portapapeles de Gboard, que llega como insertText y no como pegado. Letra por letra, o lo que se va armando con
 * el teclado (insertCompositionText trae la palabra entera, también un link a medio escribir), null: se escribió.
 */
export function loQueEntro(e: { inputType: string; data: string | null }, pegadoAntes: string | null = null): string | null {
  if (e.inputType === 'insertFromPaste') return e.data || pegadoAntes || ''
  return e.inputType === 'insertText' && e.data && e.data.length > 1 ? e.data : null
}

/** Adónde pasa el foco al dejar un campo: otro de los que se completan, el botón de mandar, o ninguno de esos. */
export type Destino = Campo | 'enviar' | null

/**
 * Lo último que se tocó, para saber adónde va el foco cuando el focusout no lo dice (sin relatedTarget): tocar la
 * etiqueta "¿Qué querés?", que no toma el foco y lo pasa al título recién en el click, o en Safari un botón, que no lo
 * toma. Vale solo para ese toque: se olvida cuando algo toma el foco, cuando el gesto se corta (un arrastre que empieza
 * sobre "Agregar", fijo abajo) y cuando termina (después del click). Si no, quedaba viejo y un "Listo" del teclado más
 * tarde contaba como ir a "Agregar" (no se buscaba lo escrito). Un toque en el mismo campo que se deja (el segundo toque
 * en el título, para "Pegar" o para mover el cursor) no es ir a otro lado: no cuenta.
 */
export function ultimoToque<T>() {
  let tocado: T | null = null
  return {
    tocar(t: T | null) {
      tocado = t
    },
    olvidar() {
      tocado = null
    },
    /** Para olvidar este toque más tarde, si para entonces no hubo otro. */
    terminar() {
      const t = tocado
      return () => {
        if (tocado === t) tocado = null
      }
    },
    /** Lo tocado, al dejar ese campo (null si fue el mismo). */
    alDejar: (campo: T) => (tocado === campo ? null : tocado),
  }
}

export type Completador = {
  /** Cambió el título o "Link a la tienda". pegado: lo que entró de una vez (ver loQueEntro); null si se escribió. */
  alCambiar: (pegado: string | null) => void
  /** Dejó uno de los campos que se completan; va: adónde pasa el foco. */
  alDejar: (campo: Campo, va: Destino) => void
  /**
   * Tocó el botón de mandar (o Enter, que lo toca), antes de que el navegador revise los campos: lo escrito sin buscar no
   * se busca (el servidor pone el nombre del link), pero lo que puso el link anterior sale (y el mismo producto ya leído
   * queda como al dejar el campo); lo que no se escribió mientras el dueño estaba en un campo, se escribe; y el título no
   * queda vacío por lo que se está leyendo (frenaba "Agregar").
   */
  antesDeMandar: () => void
  /**
   * El formulario se manda, antes de que se arme el FormData: lo mismo (si no pasó por el botón), y lo que esté en curso
   * se corta: lo que llegue tarde ya no se aplica.
   */
  alMandar: () => void
  /** El formulario se va: se corta lo que esté en curso, y lo que llegue tarde ya no se aplica. */
  cerrar: () => void
}

/**
 * Cuándo se pide la lectura y qué se hace con lo que vuelve. Un pegado que trae el link (ver loQueEntro) se busca en el
 * momento; lo escrito a mano, recién al dejar el campo, nunca con un reloj: así no se lee un pedazo de un link a medio
 * escribir. Un link que no se busca (la home de una tienda, que no tiene un producto; uno que el servidor no toma; el que
 * ya tenía el deseo) igual saca lo que puso el anterior. Un pedido por vez: un link nuevo corta el anterior, y lo que
 * llegue de ese se descarta. Lo que ya se leyó no se vuelve a pedir (si se pega de nuevo, se vuelve a completar con
 * eso), salvo que no haya cargado o no lo hayan dejado ver; el mismo producto (ver mismoProducto), tampoco, y escrito
 * a mano no vuelve a poner nada. Sin reintentos. Nada de esto frena el envío.
 * El campo donde está el dueño no se toca: lo que había que poner ahí se pone al dejarlo (o al mandar).
 */
export function completador(o: {
  /** Al editar: el link a la tienda y el título que ya tenía el deseo (sus links no se buscan). */
  guardado: string | null
  tituloGuardado?: string | null
  leer: () => Valores
  /** El campo donde está el dueño, si es uno de los que se completan. */
  enfocado?: () => Campo | null
  /** Escribe los campos que vienen y, si viene foto (null incluido), se la propone a FotoField. */
  escribir: (campos: Campos, foto?: string | null) => void
  mostrar: (linea: Linea) => void
  pedir?: (link: string, signal: AbortSignal) => Promise<Contestado | undefined>
}): Completador {
  const pedir = o.pedir ?? pedirLectura
  const guardados = linksGuardados(o.guardado, o.tituloGuardado ?? null)
  const leidos = new Map<string, RespuestaLink>()
  let actual: string | null = null
  let puesto: Puesto | null = null
  let enCurso: { link: string; corte: AbortController } | null = null
  /** Lo escrito a mano que se busca al dejar el campo. */
  let pendiente: string | null = null
  /** Lo que contestó un link y no se escribió porque el dueño estaba en esos campos: va al dejarlos (ver soltar). */
  let diferido: { link: string; r: Contestado; campos: Campo[] } | null = null
  /** El texto que vino pegado junto con un link (ver queCompletar). */
  let delPegado: { link: string; texto: string } | null = null
  const pegadoCon = (link: string) => (delPegado?.link === link ? delPegado.texto : null)
  const enfocado = () => o.enfocado?.() ?? null

  /** Lo pendiente y lo que se estaba buscando, cortado; si decía "Buscando…", ya no (no se busca nada). */
  function cortar() {
    pendiente = null
    if (!enCurso) return
    enCurso.corte.abort()
    enCurso = null
    o.mostrar({ aviso: '' })
  }

  /** Si se busca ese link: el que hay que completar (ver linkParaCompletar), y no la home de una tienda. */
  const seBusca = (link: string) => linkParaCompletar(o.leer(), guardados, puesto) === link && !esHome(link)

  function aplicar(link: string, r: Contestado, foco = enfocado()) {
    const v = o.leer()
    const c = linkParaCompletar(v, guardados, puesto) === link ? queCompletar(v, link, r, puesto, foco, pegadoCon(link)) : null
    if (!c) return
    puesto = c.puesto
    diferido = c.retenidos ? { link, r, campos: c.retenidos } : null
    o.escribir(c, c.foto)
    o.mostrar({ aviso: c.aviso ?? '', consejoFoto: c.consejoFoto })
    actual = linkDelForm(o.leer(), puesto)
  }

  /** Lo que puso el link anterior y nadie tocó, afuera (ver loDelAnterior), con la foto que propuso. */
  function sacarLoDelAnterior(link: string, escribiendo: boolean) {
    const antes = loDelAnterior(o.leer(), link, puesto, escribiendo)
    if (!antes) return
    puesto = antes.puesto
    diferido = null
    o.escribir(antes.campos, null)
  }

  /**
   * Con el link en "Link a la tienda" y el título vacío, mientras se lee (o sin leer, al mandar): el nombre que trae el
   * link (o el sitio), que la respuesta reemplaza. Vacío, "Agregar" quedaba frenado ("Completá este campo") hasta que
   * volviera, 9 s como mucho. Va solo al dejar el título o al mandar (ver soltarTitulo), no al empezar a buscar: si el
   * dueño tocaba el título para escribir, quedaba pegado a lo suyo ("Mate imperialTermo").
   */
  function nombreMientrasBusca(link: string) {
    const v = o.leer()
    if (v.titulo.trim() || deLaTienda(v) !== link) return
    const titulo = nombreDelLink(link)
    puesto = { ...(puesto ?? { link }), titulo, tituloDe: undefined }
    o.escribir({ titulo })
  }

  /**
   * Al dejar un campo (o al mandar): lo que contestó el link y no se escribió porque el dueño estaba ahí, si sigue siendo
   * el mismo producto. Se calcula de nuevo con lo que hay (lo que escribió mientras tanto queda), y solo en esos campos:
   * lo que ya se puso y el dueño cambió o vació no vuelve. va: adónde pasa el foco, que sigue esperando.
   */
  function soltar(va: Campo | null) {
    const d = diferido
    const v = o.leer()
    const link = linkDelForm(v, puesto)
    if (!d || !puesto || !link || !mismoProducto(link, d.link)) return
    const c = queCompletar(v, link, d.r, puesto, va, pegadoCon(link))
    if (!c) return
    const sueltos = d.campos.filter((k) => !c.retenidos?.includes(k))
    if (!sueltos.length) return
    const quedan = d.campos.filter((k) => !sueltos.includes(k))
    diferido = quedan.length ? { ...d, campos: quedan } : null
    const campos: Campos = {}
    for (const k of sueltos) if (c[k] !== undefined && c[k] !== v[k]) campos[k] = c[k]
    const nuevo: Puesto = { ...puesto }
    for (const k of sueltos) nuevo[k] = c.puesto[k]
    if (sueltos.includes('titulo')) {
      nuevo.tituloDe = undefined
      // el link que sale del título pasa a la tienda
      if (c.linkTienda !== undefined) campos.linkTienda = c.linkTienda
      nuevo.linkTienda = c.puesto.linkTienda
    }
    puesto = nuevo
    if (!Object.keys(campos).length) return
    o.escribir(campos)
    // el aviso nombra lo que puso y se ve
    const ok = esOk(d.r)
    if (!ok) return
    const w = o.leer()
    const nombre = !!ok.titulo && nuevo.titulo === ok.titulo && w.titulo === ok.titulo
    o.mostrar({ aviso: avisoDe(ok, nombre, !!ok.precio && nuevo.precio === ok.precio && w.precio === ok.precio) ?? '' })
  }

  /**
   * Al dejar el título (o al mandar), lo que no depende de lo que contestó el link: lo que dejó ahí el link anterior
   * (tituloDe: el dueño estaba en el título, ver loDelAnterior), y el nombre del link si quedó vacío mientras se busca (o,
   * al mandar, uno escrito que no se buscó).
   */
  function soltarTitulo() {
    const v = o.leer()
    const link = linkDelForm(v, puesto)
    if (!link) return
    if (puesto?.tituloDe && !mismoProducto(puesto.tituloDe, link)) {
      const titulo = tituloSinLoPuesto(v, link, puesto)
      puesto = { ...puesto, titulo: titulo === link ? undefined : titulo, tituloDe: undefined }
      if (titulo !== undefined && titulo !== v.titulo) o.escribir({ titulo })
    }
    if (enCurso?.link === link || (pendiente === link && seBusca(link))) nombreMientrasBusca(link)
  }

  /** Lo ya leído del producto que está puesto, si ese link es del mismo (ver mismoProducto). */
  const leidoDelPuesto = (link: string) => (puesto && mismoProducto(link, puesto.link) ? leidos.get(puesto.link) : undefined)
  /** Lo ya leído de ese link, o del mismo producto. */
  const yaLeido = (link: string) => leidos.get(link) ?? leidoDelPuesto(link)

  /** va: el campo donde está el dueño o adonde va (dejó otro para ir ahí), que no se escribe. */
  async function buscar(link: string, va: Campo | null) {
    pendiente = null
    const leido = yaLeido(link)
    sacarLoDelAnterior(link, va === 'titulo')
    if (leido) {
      leidos.set(link, leido)
      return aplicar(link, leido, va)
    }
    if (!seBusca(link)) return o.mostrar({ aviso: '' })
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
    // lo que no cargó o no dejaron ver (muchas veces un 429 pasajero de la tienda) se vuelve a pedir si lo pega de nuevo
    if (r && r !== 'muchos' && r.estado !== 'no-carga' && r.estado !== 'bloqueado') leidos.set(link, r)
    aplicar(link, r)
  }

  /**
   * Lo escrito a mano, al dejar el campo. El mismo producto que ya se leyó (sin lo de seguimiento, recortado a mano) ya
   * está completo: no se vuelve a poner nada (volvían el precio que había borrado y la foto que había quitado); si está en
   * el título, solo pasa a la tienda, como lo que contesta un link (ver soltar).
   */
  function buscarEscrito(link: string, va: Campo | null) {
    const leido = leidoDelPuesto(link)
    if (!puesto || !leido) return void buscar(link, va)
    pendiente = null
    leidos.set(link, leido)
    const v = o.leer()
    const enTitulo = !!delTitulo(v, puesto)
    // el link a la tienda que puso el autocompletado, recortado, sigue siendo suyo
    puesto = { ...puesto, link, ...(!enTitulo && puesto.linkTienda ? { linkTienda: v.linkTienda.trim() } : {}) }
    if (enTitulo) diferido = { link, r: leido, campos: ['titulo', 'linkTienda'] }
  }

  function antesDeMandar() {
    // lo escrito del mismo producto ya leído queda como al dejar el campo (sin pedir nada: si está en el título, pasa a la
    // tienda con el nombre); otro link no se busca, pero lo del anterior sale
    if (pendiente && leidoDelPuesto(pendiente)) buscarEscrito(pendiente, null)
    else if (pendiente) sacarLoDelAnterior(pendiente, false)
    soltar(null)
    soltarTitulo()
    // lo que vino pegado con el link sigue en el título (no volvió la lectura): va el link solo, y el servidor pone el
    // nombre que trae el link
    const t = delTitulo(o.leer(), puesto)
    if (delPegado && t?.link === delPegado.link && t.resto === delPegado.texto) o.escribir({ titulo: delPegado.link })
  }

  return {
    alCambiar(pegado) {
      const link = linkDelForm(o.leer(), puesto)
      const trajo = !!link && pegado !== null && traeElLink(pegado, link)
      // el mismo link: nada (escribió o pegó otra cosa); pegado de nuevo, se completa otra vez si no se está buscando
      if (link === actual && !(trajo && enCurso?.link !== link)) return
      actual = link
      cortar()
      if (!link) return o.mostrar({ aviso: '' })
      if (!trajo) {
        pendiente = link
        return
      }
      delPegado = { link, texto: linkEnTexto(pegado ?? '')?.resto ?? '' }
      void buscar(link, enfocado())
    },
    alDejar(campo, va) {
      // vuelve al mismo (tocó su etiqueta): no lo dejó
      if (va === campo) return
      // va a "Agregar": no se busca (se cortaría al mandar, y gastaba un pedido del tope)
      if (va === 'enviar') return antesDeMandar()
      if (pendiente) buscarEscrito(pendiente, va)
      soltar(va)
      if (campo === 'titulo') soltarTitulo()
    },
    antesDeMandar,
    alMandar() {
      antesDeMandar()
      cortar()
    },
    cerrar: cortar,
  }
}
