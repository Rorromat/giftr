'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { pegarLink } from '@/components/QueQueres'
import { Icon } from '@/components/ui'
import { achicarFoto } from '@/lib/achicar-foto'
import { alPegarImagen, estadoDelLink, porQueEsperar, queHacerConPropuesta, TRAER_FOTO_MS } from '@/lib/foto-del-form'
import { esUrlFotoDeseo, linkHttp } from '@/lib/links'

const ES_LINK = /^https?:\/\/\S+$/i

/** El id del campo para elegir la foto (los botones "Foto" y "Cambiar foto" lo abren). */
export const ID_ELEGIR_FOTO = 'elegir-foto-deseo'

const AVISOS = {
  subiendo: 'Subiendo la foto…',
  probando: 'Cargando la foto…',
  trayendo: 'Trayendo la foto…',
  error: 'No pudimos subir esa foto. Probá con otra.',
  muchas: 'Ya subiste muchas fotos hoy. Probá mañana, o pegá el link de una foto.',
  'sin-foto': 'No hay una foto copiada. Mantené apretada una foto, tocá Copiar y volvé a tocar Pegar.',
  'sin-link': 'No hay ningún link copiado. En la tienda tocá Compartir → Copiar link, y volvé a tocar Pegar link.',
  'no-es-foto': 'Ese link no es una foto (si es de una tienda, pegalo en "¿Qué querés?").',
  'no-carga': 'Esa foto ya no carga. Cambiala, o borrá el link.',
  'muy-largo': 'Ese link es muy largo. Copiá la foto y tocá Pegar una foto copiada.',
} as const

/** Si el link carga como imagen en este navegador (la página de un producto, no). Con tope, lo que tarda más no cargó. */
function cargaComoFoto(src: string, tope?: number): Promise<boolean> {
  return new Promise((listo) => {
    const img = new Image()
    img.onload = () => listo(img.naturalWidth > 0)
    img.onerror = () => listo(false)
    if (tope !== undefined) setTimeout(() => listo(false), Math.max(0, tope))
    img.src = src
  })
}

const PROPUESTA = 'deseo:foto-propuesta'
const CONSEJO = 'deseo:foto-consejo'
const SIN_FOTO = 'Pegá el link de la tienda: traemos nombre, foto y precio.'

/**
 * La foto del producto que encontró la lectura del link (ver CompletarDesdeLink), para el campo de foto de ese formulario;
 * null si el producto no tiene: se saca la que había propuesto otro link. El campo decide qué hace (queHacerConPropuesta).
 */
export function proponerFoto(form: HTMLFormElement, src: string | null) {
  form.dispatchEvent(new CustomEvent<string | null>(PROPUESTA, { detail: src }))
}

/**
 * Cómo poner la foto que la lectura del link no pudo traer (una publicación de MercadoLibre que no se deja ver), o null.
 * Va en el lugar de la foto, en vez del texto de siempre, y solo si no hay foto: no corre nada de lugar.
 */
export function aconsejarFoto(form: HTMLFormElement, texto: string | null) {
  form.dispatchEvent(new CustomEvent<string | null>(CONSEJO, { detail: texto }))
}

const COMPARTIDA = 'deseo:foto-compartida'
/** La foto compartida a GiftR desde otra app (ver RecibirCompartido): se sube como una elegida con Foto, y es del dueño. */
export function entregarFoto(form: HTMLFormElement, foto: Blob) {
  form.dispatchEvent(new CustomEvent<Blob>(COMPARTIDA, { detail: foto }))
}

/**
 * La foto del deseo, que es lo que más ayuda a que acierten: de la galería o la cámara, pegada (con el botón
 * o pegando una imagen en cualquier campo del formulario) o con el link de una foto. Lo elegido viaja en el
 * campo oculto fotoUrl: la URL de la foto subida (/foto/deseo/:id) o el link, solo si cargó como foto (un link de
 * tienda en el campo de foto quedaba como foto rota para todos). También la del producto del link pegado (proponerFoto),
 * si no hay una que eligió el dueño: se trae y se guarda como una subida.
 */
export function FotoField({ inicial = null }: { inicial?: string | null }) {
  const raiz = useRef<HTMLDivElement>(null)
  const elegir = useRef<HTMLInputElement>(null)
  const link = useRef<HTMLInputElement>(null)
  const guardado = inicial && ES_LINK.test(inicial) ? inicial : null
  const [subida, setSubida] = useState(inicial && !guardado ? inicial : null)
  const [url, setUrl] = useState(guardado ?? '')
  // los links que ya se probaron: si cargan como foto o no
  const [probados, setProbados] = useState<Record<string, boolean>>({})
  const [aviso, setAviso] = useState<keyof typeof AVISOS | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  // la vista previa que no cargó (la foto guardada de una tienda que la sacó)
  const [rota, setRota] = useState<string | null>(null)
  // Una subida a la vez (un pegado y un toque en Foto seguidos no corren juntos), y lo último que se hizo gana: si
  // mientras sube (o mientras se prueba un link pegado) se elige otra foto, se escribe un link o se quita la foto, lo que
  // llega tarde no lo pisa.
  const enCurso = useRef(false)
  const ultima = useRef(0)
  // las que hizo el dueño (la prueba de un link copiado con Pegar solo pierde contra estas)
  const propias = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)
  // el link copiado que se está probando con Pegar: hasta que carga, el formulario no se manda
  const [probandoPegado, setProbandoPegado] = useState(false)
  // La foto del producto del link: mientras se trae, el formulario no se manda (9 s como mucho), pero Foto y Pegar siguen
  // andando y lo que elija el dueño gana. La que vino así y nadie tocó (dePropuesta) la cambia la de otro link.
  const [trayendo, setTrayendo] = useState(false)
  const [dePropuesta, setDePropuesta] = useState(false)
  const propuesta = useRef<string | null>(null)
  // el pedido de la que se está trayendo: si queda atrás, se corta (no gasta el cupo de fotos en una que no va)
  const traida = useRef<AbortController | null>(null)
  const [consejo, setConsejo] = useState<string | null>(null)
  // si pidió escribir el link de una foto
  const [conLink, setConLink] = useState(false)

  const delLink = estadoDelLink(url, guardado, probados)
  const foto = subida ?? (delLink.estado === 'ok' ? delLink.link : null)

  function anotar(l: string, ok: boolean) {
    setProbados((p) => ({ ...p, [l]: ok }))
  }

  /**
   * Algo nuevo con la foto: lo que estaba en curso (una subida, la foto que se estaba trayendo) ya no lo pisa al terminar.
   * Si lo hizo el dueño (propia), la foto pasa a ser suya y otro link ya no la cambia, y gana también sobre la prueba de un
   * link copiado con Pegar; una propuesta nueva, no (ver pegar).
   */
  function nuevaAccion(propia = true) {
    traida.current?.abort()
    traida.current = null
    setTrayendo(false)
    if (propia) {
      setProbandoPegado(false)
      setDePropuesta(false)
      propias.current++
    }
    return ++ultima.current
  }

  async function subir(imagen: Blob) {
    if (enCurso.current) return
    enCurso.current = true
    const n = nuevaAccion()
    setSubiendo(true)
    setAviso(null)
    try {
      const r = await fetch('/api/deseo/foto', { method: 'POST', body: await achicarFoto(imagen, 1400), headers: { 'content-type': 'image/jpeg' } })
        .catch(() => null)
      if (n !== ultima.current) return
      if (!r?.ok) return setAviso(r?.status === 429 ? 'muchas' : 'error')
      const { url: nueva } = await r.json()
      if (n !== ultima.current) return
      setSubida(nueva)
      setUrl('')
    } finally {
      enCurso.current = false
      setSubiendo(false)
    }
  }

  /** El botón Pegar: una imagen copiada se sube; un link copiado va al campo de link, solo si es una foto. */
  async function pegar() {
    setAviso(null)
    try {
      for (const copiado of await navigator.clipboard.read()) {
        const tipo = copiado.types.find((t) => t.startsWith('image/'))
        if (tipo) return await subir(await copiado.getType(tipo))
        if (copiado.types.includes('text/plain')) {
          const l = linkHttp(await (await copiado.getType('text/plain')).text())
          if (l) {
            // Se prueba antes de ponerlo: el link de un producto (lo más común de copiar, recién pegado en el título) no es
            // una foto, y entonces no cambia nada: ni corta la del link que se está trayendo, ni hace suya la que vino así.
            const p = ++propias.current
            setProbandoPegado(true)
            setAviso('probando')
            const ok = probados[l] ?? await cargaComoFoto(l)
            anotar(l, ok)
            // si mientras cargaba eligió otra foto, escribió un link o la quitó, gana eso
            if (p !== propias.current) return
            if (!ok) {
              setProbandoPegado(false)
              return setAviso('no-es-foto')
            }
            nuevaAccion()
            setSubida(null)
            setUrl(l)
            return setAviso(null)
          }
        }
      }
    } catch {
      // sin permiso o sin soporte: el mismo aviso
    }
    setAviso('sin-foto')
  }

  function escribir(v: string) {
    nuevaAccion()
    setUrl(v)
    setSubida(null)
    setAviso(null)
    // se prueba cuando deja de escribir, no con cada letra
    clearTimeout(espera.current)
    const { link: l, estado } = estadoDelLink(v, guardado, probados)
    if (l && estado === 'probando') espera.current = setTimeout(() => cargaComoFoto(l).then((ok) => anotar(l, ok)), 400)
  }

  function quitar() {
    nuevaAccion()
    setSubida(null)
    setUrl('')
    setAviso(null)
  }

  /**
   * La foto que propuso la lectura del link: el servidor la baja y la guarda como una subida (el deseo no depende de que la
   * tienda la siga sirviendo). Si no puede (el cupo, el tope, no es una imagen, no la dejan bajar), se prueba el link en el
   * navegador, como un link de foto: el CDN que bloquea al servidor suele cargar desde el teléfono. Si tampoco, no queda
   * ninguna, sin aviso: no la eligió el dueño.
   */
  async function traer(src: string) {
    const n = nuevaAccion(false)
    setTrayendo(true)
    // lo de un Pegar de antes ya no va; uno que se está probando sigue (si es una foto, gana)
    const sinAvisoViejo = () => setAviso((a) => (a === 'probando' ? a : null))
    sinAvisoViejo()
    const hasta = Date.now() + TRAER_FOTO_MS
    const corte = new AbortController()
    traida.current = corte
    const reloj = setTimeout(() => corte.abort(), TRAER_FOTO_MS)
    try {
      const r = await fetch('/api/deseo/foto/desde-link', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: src }), signal: corte.signal,
      }).catch(() => null)
      const nueva: unknown = r?.ok ? (await r.json().catch(() => null))?.url : null
      if (n !== ultima.current) return
      if (typeof nueva === 'string' && esUrlFotoDeseo(nueva)) {
        setSubida(nueva)
        setUrl('')
        sinAvisoViejo()
        return setDePropuesta(true)
      }
      const l = linkHttp(src)
      const ok = !!l && (probados[l] ?? await cargaComoFoto(l, hasta - Date.now()))
      if (n !== ultima.current) return
      if (l && ok) anotar(l, true)
      setSubida(null)
      setUrl(l && ok ? l : '')
      setDePropuesta(ok)
      // un Pegar que no era una foto, mientras se traía esta: con la foto puesta, el aviso ya no va
      if (ok) sinAvisoViejo()
    } finally {
      clearTimeout(reloj)
      if (traida.current === corte) traida.current = null
      if (n === ultima.current) setTrayendo(false)
    }
  }

  const alProponer = useEffectEvent((src: string | null) => {
    // traida, y no solo trayendo: la que se empezó a traer en este mismo momento todavía no se dibujó (otro link pegado
    // enseguida no la sacaba, y quedaba la foto de uno con el link del otro)
    const que = queHacerConPropuesta({
      src, anterior: propuesta.current, trayendo: trayendo || traida.current !== null, hayFoto: !!subida || !!url.trim(), dePropuesta,
      subiendo: enCurso.current,
    })
    if (que === 'nada') return
    propuesta.current = src
    if (que === 'traer' && src) return void traer(src)
    // El producto nuevo no tiene foto: la del anterior no es de este. Ya, sin esperar al próximo render: se saca también
    // al mandar (ver CompletarDesdeLink), justo antes de que se arme lo que se manda.
    flushSync(() => {
      nuevaAccion(false)
      setDePropuesta(false)
      setSubida(null)
      setUrl('')
    })
  })
  useEffect(() => {
    const form = raiz.current?.closest('form')
    const texto = (e: Event) => (e instanceof CustomEvent && typeof e.detail === 'string' ? e.detail : null)
    const escuchar = (e: Event) => alProponer(texto(e))
    const aconsejar = (e: Event) => setConsejo(texto(e))
    form?.addEventListener(PROPUESTA, escuchar)
    form?.addEventListener(CONSEJO, aconsejar)
    return () => {
      form?.removeEventListener(PROPUESTA, escuchar)
      form?.removeEventListener(CONSEJO, aconsejar)
    }
  }, [])
  // la compartida desde otra app (ver entregarFoto): el mismo camino que Foto
  const alCompartir = useEffectEvent((foto: Blob) => void subir(foto))
  useEffect(() => {
    const form = raiz.current?.closest('form')
    const compartida = (e: Event) => { if (e instanceof CustomEvent && e.detail instanceof Blob) alCompartir(e.detail) }
    form?.addEventListener(COMPARTIDA, compartida)
    return () => form?.removeEventListener(COMPARTIDA, compartida)
  }, [])

  // Pegar una imagen en cualquier campo (por ejemplo en "¿Qué querés?") también la sube; si trae texto, el texto va al
  // campo (ver alPegarImagen).
  const alPegar = useEffectEvent((e: ClipboardEvent) => {
    const imagen = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (!imagen) return
    const destino = e.target
    const enCampoDeTexto = destino instanceof HTMLTextAreaElement || destino instanceof HTMLInputElement
      || (destino instanceof HTMLElement && destino.isContentEditable)
    const que = alPegarImagen({
      texto: e.clipboardData?.getData('text/plain') ?? '', html: e.clipboardData?.getData('text/html') ?? '',
      enCampoDeTexto, hayFoto: !!foto, subiendo: enCurso.current,
    })
    if (!que.dejarTexto) e.preventDefault()
    if (que.subir) subir(imagen)
  })
  useEffect(() => {
    const escuchar = (e: ClipboardEvent) => alPegar(e)
    document.addEventListener('paste', escuchar)
    return () => document.removeEventListener('paste', escuchar)
  }, [])

  // el formulario no se manda hasta que la foto esté, ni con un link que no es una foto (ver porQueEsperar)
  const frena = porQueEsperar({ subiendo, probandoPegado, trayendo, subida: !!subida, estado: delLink.estado })
  const bloqueo = frena === 'subiendo' ? 'Esperá que termine de subir la foto.'
    : frena === 'probando' || frena === 'trayendo' ? 'Esperá que cargue la foto.'
      : frena ? AVISOS[frena] : ''
  useEffect(() => {
    link.current?.setCustomValidity(bloqueo)
  }, [bloqueo])

  // Abajo, solo lo que hizo el dueño (subir, probar un Pegar, los errores). Lo que llega solo, la foto del link mientras
  // se trae, va en el lugar de la foto: una línea nueva acá corría todo lo de abajo dos veces (al empezar y al llegar),
  // sin que el dueño hiciera nada.
  const mensaje = subiendo ? 'subiendo'
    : aviso ?? (subida ? null : delLink.estado === 'ok' ? (rota === foto ? 'no-carga' : null) : delLink.estado)
  // el link de una foto se escribe solo si lo pide (o si ya hay uno); escondido sigue ahí, porque frena el envío
  const verLink = conLink || !!url
  // "Pegar link": lo copiado va al título y se busca (ver pegarLink); sin nada copiado, lo dice acá
  async function pegarElLink() {
    const form = raiz.current?.closest('form')
    if (form && !(await pegarLink(form))) setAviso('sin-link')
  }

  const sutil = 'min-h-10 text-[12.5px] font-semibold text-gr-muted underline decoration-1 underline-offset-4'
  return (
    <div ref={raiz} className="flex flex-col gap-2">
      {foto && rota !== foto ? (
        <div className="relative overflow-hidden rounded-[18px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- fotos subidas o de tiendas externas */}
          <img src={foto} alt="Vista previa de la foto" data-vista-previa onError={() => setRota(foto)}
               // si falló antes de que cargue la página, onError no llega
               ref={(img) => { if (img?.complete && !img.naturalWidth) setRota(foto) }}
               // la que vino de otro link, mientras se trae la de este
               className={`h-[220px] w-full object-cover${trayendo ? ' motion-safe:animate-pulse' : ''}`} />
          <button type="button" aria-label="Quitar foto" onClick={quitar}
                  className="absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full bg-white/95 shadow-[0_1px_4px_rgb(20_20_20/0.18)]">
            <Icon name="close" size={14} strokeWidth={3} />
          </button>
          <button type="button" onClick={() => elegir.current?.click()} disabled={subiendo}
                  className="absolute bottom-2.5 right-2.5 flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[13px] font-semibold shadow-[0_1px_4px_rgb(20_20_20/0.18)]">
            <Icon name="camera" size={15} strokeWidth={2.2} />Cambiar foto
          </button>
        </div>
      ) : (
        // Donde va a estar la foto del deseo: pegar el link de la tienda (trae nombre, foto y precio) o elegir una foto.
        // Mientras se trae la del link lo dice acá, y al llegar la foto queda en este lugar: no se corre nada.
        <div className={`flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[18px] bg-gr-soft px-3 py-5 text-center ${subiendo || trayendo ? 'motion-safe:animate-pulse' : ''}`}>
          <div className="grid w-full grid-cols-2 gap-2">
            <button type="button" onClick={pegarElLink} className="gr-btn h-[52px] gap-2 border-gr-accent bg-gr-accent text-[15px]">
              <Icon name="paste" size={18} strokeWidth={2} />Pegar link
            </button>
            <button type="button" onClick={() => elegir.current?.click()} disabled={subiendo} className="gr-btn h-[52px] gap-2 text-[15px]">
              <Icon name="camera" size={18} strokeWidth={2} />Foto
            </button>
          </div>
          <span role="status" className="px-2 text-[13px] leading-snug font-medium text-gr-muted">{trayendo ? AVISOS.trayendo : consejo ?? SIN_FOTO}</span>
          {/* lo de siempre, más chico: una foto copiada (también se pega en cualquier campo) o el link de una foto */}
          <div className="-mb-2 flex flex-wrap justify-center gap-x-4">
            <button type="button" onClick={pegar} disabled={subiendo} className={sutil}>Pegar una foto copiada</button>
            {!verLink && (
              <button type="button" onClick={() => { setConLink(true); setTimeout(() => link.current?.focus(), 0) }} className={sutil}>
                Usar el link de una foto
              </button>
            )}
          </div>
        </div>
      )}
      <input ref={elegir} id={ID_ELEGIR_FOTO} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
      {mensaje && (
        <p role={mensaje === 'subiendo' || mensaje === 'probando' ? 'status' : 'alert'} className="text-xs font-semibold">{AVISOS[mensaje]}</p>
      )}
      <input ref={link} value={url} placeholder="El link de una foto" aria-label="Link de una foto"
             inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
             {...(verLink ? { className: 'gr-input' } : { className: 'sr-only -mt-2', tabIndex: -1, 'aria-hidden': true })}
             onChange={(e) => escribir(e.target.value)} />
      <input type="hidden" name="fotoUrl" value={foto ?? ''} />
    </div>
  )
}
