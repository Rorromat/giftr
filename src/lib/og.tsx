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
import { ONDAS } from '@/lib/ondas'

// Imágenes Open Graph (la vista previa de WhatsApp), como la app de día: el fondo papel, la tinta, las fotos con las puntas
// redondeadas, los títulos en Hanken Grotesk 900 y el verde del acento en el precio, el moño y el círculo ondulado.
// Generador: next/og (Satori), que solo entiende flexbox y no lee WebP; las fotos pasan antes por sharp.

export const OG_SIZE = { width: 1200, height: 630 }
/** Los de tokens.css, de día: --gr-bg, --gr-ink, --gr-surface, --gr-acento, --gr-acento-oscuro (el verde para texto), --gr-muted. */
const C = { bg: '#F5F5F7', ink: '#121216', surface: '#FFFFFF', acento: '#10B66E', acentoTexto: '#08794A', muted: '#6C6C75' }

const fuentes = Promise.all([900, 600].map(async (weight) => ({
  name: 'Hanken', weight: weight as 900 | 600, style: 'normal' as const,
  data: await readFile(join(process.cwd(), `assets/fonts/HankenGrotesk-${weight}.woff`)),
})))

/**
 * Trae la foto del deseo y la deja en JPEG del tamaño justo. Las subidas (/foto/deseo/:id) se leen de la base; las de
 * afuera, solo por https a direcciones públicas, siguiendo a mano hasta 3 redirecciones (cada una se revisa), con 5 s y
 * 8 MB como mucho en total (ver bajarFoto). Cualquier otra ruta relativa no es una URL para esFotoPublica: no se pide.
 * Si algo falla, null: la imagen sale con la inicial en el círculo ondulado en vez de la foto.
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

/** El círculo ondulado del sello (ver Insignia), con un texto adentro: la inicial sin foto, cuántos deseos. */
function Insignia({ size, texto, fontSize }: { size: number; texto: string; fontSize: number }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
        <path d={ONDAS} fill={C.acento} />
      </svg>
      <span style={{ fontSize, fontWeight: 900, color: C.ink, marginTop: -fontSize * 0.08 }}>{texto}</span>
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

/** El logo, como en el encabezado de la app: "GiftR" en 900 con el moño al final, un poco torcido. */
function Logo({ arriba = false }: { arriba?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', position: 'absolute', right: 56, ...(arriba ? { top: 50 } : { bottom: 46 }),
      fontSize: 50, fontWeight: 900, letterSpacing: -2.5, color: C.ink,
    }}>GiftR<div style={{ display: 'flex', marginTop: -16, marginLeft: 2, transform: 'rotate(14deg)' }}><Mono size={50} /></div></div>
  )
}

/** Una foto con las puntas redondeadas y una sombra suave. Sin foto, la inicial en el círculo ondulado. */
function Foto({ src, titulo, ancho, alto }: { src: string | null; titulo: string; ancho: number; alto: number }) {
  return (
    <div style={{
      display: 'flex', width: ancho, height: alto, borderRadius: 40, overflow: 'hidden', background: '#EBEBEF',
      boxShadow: '0 24px 48px -20px rgba(18, 18, 22, 0.35)', alignItems: 'center', justifyContent: 'center',
    }}>
      {src
        // eslint-disable-next-line @next/next/no-img-element -- Satori dibuja <img>, no next/image
        ? <img src={src} width={ancho} height={alto} alt="" style={{ objectFit: 'cover' }} />
        : <Insignia size={Math.min(ancho, alto) * 0.5} texto={titulo.trim().charAt(0).toUpperCase() || 'G'} fontSize={Math.min(ancho, alto) * 0.24} />}
    </div>
  )
}

/** Una pastilla: en tinta (de quién es) o en el verde ("Lo quiere mucho"). */
function Etiqueta({ children, oscura = false }: { children: string; oscura?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignSelf: 'flex-start', padding: '10px 22px', borderRadius: 999,
      background: oscura ? C.ink : C.acento, color: oscura ? C.surface : C.ink, fontSize: 26, fontWeight: 600,
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

const fondo = { width: '100%', height: '100%', display: 'flex', background: C.bg, fontFamily: 'Hanken', position: 'relative' } as const

/** Un deseo: la foto grande a la izquierda; de quién es, qué es y cuánto sale a la derecha. */
export async function imagenItem(i: ItemCompartido) {
  const src = await foto(i.fotoUrl, 480, 480)
  const para = i.grupoNombre ?? `Lista de ${i.para.split(' ')[0]}`
  return render(
    <div style={{ ...fondo, padding: '58px 60px', alignItems: 'center', gap: 64 }}>
      <Foto src={src} titulo={i.titulo} ancho={492} alto={492} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 24, paddingBottom: 80 }}>
        <Etiqueta oscura>{recortar(para, 28)}</Etiqueta>
        <div style={{ display: 'flex', fontSize: i.titulo.length > 40 ? 54 : 66, fontWeight: 900, lineHeight: 1, letterSpacing: -2.8, color: C.ink }}>
          {recortar(i.titulo, 80)}
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {i.precio && (
            <div style={{ display: 'flex', fontSize: 56, fontWeight: 900, letterSpacing: -2.2, color: C.acentoTexto }}>{recortar(i.precio, 22)}</div>
          )}
          {i.prioridad === 'mucho' && <Etiqueta>Lo quiere mucho</Etiqueta>}
        </div>
      </div>
      <Logo />
    </div>,
  )
}

/** Una lista: de quién es, cuántos deseos y hasta 3 fotos. */
export async function imagenLista(l: ListaCompartida) {
  const fotos = await Promise.all(l.fotos.map((f) => foto(f, 300, 300)))
  const titulo = recortar(l.grupoNombre ?? `Lista de ${l.para.split(' ')[0]}`, 24)
  return render(
    <div style={{ ...fondo, flexDirection: 'column', padding: '56px 64px', gap: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {/* largo acotado para no pisar el logo de arriba a la derecha */}
        <div style={{ display: 'flex', fontSize: titulo.length > 16 ? 60 : 82, fontWeight: 900, letterSpacing: -3.2, lineHeight: 1, color: C.ink }}>
          {titulo}
        </div>
        {l.cantidad > 0 && <Insignia size={116} texto={String(Math.min(l.cantidad, 99))} fontSize={50} />}
      </div>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: C.muted }}>Elegí, reservá y no te duplicás con nadie.</div>
      <div style={{ display: 'flex', gap: 32, marginTop: 6 }}>
        {(fotos.length ? fotos : [null]).map((src, n) => (
          <Foto key={n} src={src} titulo={l.para} ancho={300} alto={300} />
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
      <div style={{ display: 'flex', fontSize: 56, fontWeight: 900, letterSpacing: -2.4, color: C.ink }}>Pedí lo que querés sin pedirlo.</div>
    </div>,
  )
}
