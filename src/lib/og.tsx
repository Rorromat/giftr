import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { db } from '@/db'
import { esFotoPublica, type ItemCompartido, type ListaCompartida } from '@/lib/compartir'
import { bajarFoto, pedirAfuera } from '@/lib/bajar-foto'
import { leerFotoDeseo } from '@/lib/fotos-deseo'
import { idDeUrlFotoDeseo } from '@/lib/links'
import { PARTES_MONO, TONOS_MONO } from '@/lib/mono'

// Imágenes Open Graph (la vista previa de WhatsApp) con el estilo Sticker: crema, tinta, ácido y bordes gruesos.
// Generador: next/og (Satori), que solo entiende flexbox y no lee WebP; las fotos pasan antes por sharp.

export const OG_SIZE = { width: 1200, height: 630 }
const C = { bg: '#FFF6E5', ink: '#121212', surface: '#FFFFFF', accent: '#C8F31D', muted: '#5C574F' }
const STAR = '50,2 59.8,13.3 74,8.4 76.9,23.1 91.6,26 86.7,40.2 98,50 86.7,59.8 91.6,74 76.9,76.9 74,91.6 59.8,86.7 50,98 40.2,86.7 26,91.6 23.1,76.9 8.4,74 13.3,59.8 2,50 13.3,40.2 8.4,26 23.1,23.1 26,8.4 40.2,13.3'

const fuentes = Promise.all([800, 600].map(async (weight) => ({
  name: 'Bricolage', weight: weight as 800 | 600, style: 'normal' as const,
  data: await readFile(join(process.cwd(), `assets/fonts/BricolageGrotesque-${weight}.ttf`)),
})))

/**
 * Trae la foto del deseo y la deja en JPEG del tamaño justo. Las subidas (/foto/deseo/:id) se leen de la base; las de
 * afuera, solo por https a direcciones públicas, siguiendo a mano hasta 3 redirecciones (cada una se revisa), con 5 s y
 * 8 MB como mucho en total (ver bajarFoto). Cualquier otra ruta relativa no es una URL para esFotoPublica: no se pide.
 * Si algo falla, null: la imagen sale con el starburst en vez de la foto.
 */
async function foto(src: string | null, ancho: number, alto: number): Promise<string | null> {
  if (!src) return null
  try {
    // Antes la subida se pedía por HTTP a "este mismo sitio", armado con x-forwarded-host: lo manda el cliente, así que
    // el servidor le pegaba a cualquier host:puerto que le dijeran (de la red interna también).
    const id = idDeUrlFotoDeseo(src)
    const datos = id ? await leerFotoDeseo(db, id) : await bajarFoto(src, pedirAfuera, esFotoPublica)
    if (!datos) return null
    const jpg = await sharp(datos, { limitInputPixels: 40_000_000 }).rotate().resize(ancho, alto, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${jpg.toString('base64')}`
  } catch {
    return null
  }
}

const recortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t)

function Starburst({ size, texto, fontSize }: { size: number; texto: string; fontSize: number }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
        <polygon points={STAR} fill={C.accent} stroke={C.ink} strokeWidth={3.5} strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize, fontWeight: 800, color: C.ink, marginTop: -fontSize * 0.08 }}>{texto}</span>
    </div>
  )
}

/** El moño de la marca (ver lib/mono.ts). */
function Mono({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {PARTES_MONO.map((p) => <path key={p.d} d={p.d} fill={TONOS_MONO[p.tono]} opacity={p.opacidad} />)}
    </svg>
  )
}

function Logo({ arriba = false }: { arriba?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', right: 52, ...(arriba ? { top: 52 } : { bottom: 44 }) }}>
      <div style={{
        display: 'flex', padding: '4px 22px 10px', background: C.surface, border: `4px solid ${C.ink}`, borderRadius: 22,
        boxShadow: `6px 6px 0 ${C.ink}`, transform: 'rotate(-3deg)', fontSize: 52, fontWeight: 800, letterSpacing: -3, color: C.ink,
        alignItems: 'flex-start',
      }}>GiftR<div style={{ display: 'flex', marginTop: -2, marginLeft: 4, transform: 'rotate(14deg)' }}><Mono size={50} /></div></div>
    </div>
  )
}

/** Una foto troquelada: borde de tinta, sombra dura, apenas girada. Sin foto, el starburst con la inicial. */
function FotoSticker({ src, titulo, ancho, alto, giro }: { src: string | null; titulo: string; ancho: number; alto: number; giro: number }) {
  return (
    <div style={{
      display: 'flex', width: ancho, height: alto, border: `6px solid ${C.ink}`, borderRadius: 36, overflow: 'hidden',
      background: C.surface, boxShadow: `10px 10px 0 ${C.ink}`, transform: `rotate(${giro}deg)`, alignItems: 'center', justifyContent: 'center',
    }}>
      {src
        // eslint-disable-next-line @next/next/no-img-element -- Satori dibuja <img>, no next/image
        ? <img src={src} width={ancho - 12} height={alto - 12} alt="" style={{ objectFit: 'cover' }} />
        : <Starburst size={Math.min(ancho, alto) * 0.6} texto={titulo.trim().charAt(0).toUpperCase() || 'G'} fontSize={Math.min(ancho, alto) * 0.28} />}
    </div>
  )
}

function Etiqueta({ children, oscura = false }: { children: string; oscura?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignSelf: 'flex-start', padding: '8px 20px', borderRadius: 999, border: `4px solid ${C.ink}`,
      background: oscura ? C.ink : C.accent, color: oscura ? C.bg : C.ink, fontSize: 28, fontWeight: 800,
    }}>{children}</div>
  )
}

/**
 * Satori da PNG, que con fotos pesa 600–800 KB; WhatsApp no muestra vistas previas tan pesadas.
 * Se pasa a JPEG (~100 KB). Se cachea un rato en la CDN: si cambia el deseo, se ve en minutos.
 */
async function render(contenido: React.ReactElement) {
  const png = await new ImageResponse(contenido, { ...OG_SIZE, fonts: await fuentes }).arrayBuffer()
  const jpg = await sharp(Buffer.from(png)).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
  return new Response(new Uint8Array(jpg), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400' },
  })
}

const fondo = { width: '100%', height: '100%', display: 'flex', background: C.bg, fontFamily: 'Bricolage', position: 'relative' } as const

/** Un deseo: la foto grande a la izquierda; de quién es, qué es y cuánto sale a la derecha. */
export async function imagenItem(i: ItemCompartido) {
  const src = await foto(i.fotoUrl, 480, 480)
  const para = i.grupoNombre ?? `Lista de ${i.para.split(' ')[0]}`
  return render(
    <div style={{ ...fondo, padding: '58px 60px', alignItems: 'center', gap: 64 }}>
      <FotoSticker src={src} titulo={i.titulo} ancho={492} alto={492} giro={-2.5} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 26, paddingBottom: 80 }}>
        <Etiqueta oscura>{recortar(para, 28)}</Etiqueta>
        <div style={{ display: 'flex', fontSize: i.titulo.length > 40 ? 54 : 66, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2.5, color: C.ink }}>
          {recortar(i.titulo, 80)}
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          {i.precio && (
            <div style={{
              display: 'flex', padding: '6px 18px', background: C.surface, border: `4px solid ${C.ink}`, borderRadius: 18,
              boxShadow: `5px 5px 0 ${C.ink}`, transform: 'rotate(-4deg)', fontSize: 40, fontWeight: 800, color: C.ink,
            }}>{recortar(i.precio, 22)}</div>
          )}
          {i.prioridad === 'mucho' && <Etiqueta>Lo quiere mucho</Etiqueta>}
        </div>
      </div>
      <Logo />
    </div>,
  )
}

/** Una lista: de quién es, cuántos deseos y hasta 3 fotos troqueladas. */
export async function imagenLista(l: ListaCompartida) {
  const fotos = await Promise.all(l.fotos.map((f) => foto(f, 300, 300)))
  const titulo = recortar(l.grupoNombre ?? `Lista de ${l.para.split(' ')[0]}`, 24)
  const giros = [-5, 3, -2]
  return render(
    <div style={{ ...fondo, flexDirection: 'column', padding: '56px 64px', gap: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {/* largo acotado para no pisar el logo de arriba a la derecha */}
        <div style={{ display: 'flex', fontSize: titulo.length > 16 ? 60 : 82, fontWeight: 800, letterSpacing: -3, lineHeight: 1, color: C.ink }}>
          {titulo}
        </div>
        {l.cantidad > 0 && <Starburst size={120} texto={String(Math.min(l.cantidad, 99))} fontSize={52} />}
      </div>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: C.ink }}>Elegí, reservá y no te duplicás con nadie.</div>
      <div style={{ display: 'flex', gap: 40, marginTop: 6 }}>
        {(fotos.length ? fotos : [null]).map((src, n) => (
          <FotoSticker key={n} src={src} titulo={l.para} ancho={300} alto={300} giro={giros[n]} />
        ))}
      </div>
      <Logo arriba />
    </div>,
  )
}

/** Para lo que no se encuentra (o ya no está): la marca sola, sin datos. */
export function imagenGenerica() {
  return render(
    <div style={{ ...fondo, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 30 }}>
      <Mono size={240} />
      <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, letterSpacing: -2, color: C.ink }}>Pedí lo que querés sin pedirlo.</div>
    </div>,
  )
}
