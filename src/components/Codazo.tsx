import { codazoAction } from '@/app/actions'
import { Icon } from '@/components/ui'
import { BotonEnviar } from '@/components/BotonEnviar'

const RESULTADOS: Record<string, (para: string) => string> = {
  avisado: (p) => `¡Codazo enviado! A ${p} le llegó un aviso.`,
  cartel: (p) => `¡Codazo enviado! ${p} lo va a ver cuando entre a GiftR.`,
  ya_mandaste: () => 'Ya le diste un codazo hoy. Mañana podés de nuevo.',
  muchos: () => 'Hoy ya le dieron varios codazos. Probá mañana.',
  sin_identidad: () => 'Primero decinos quién sos, así sabe quién le dio el codazo.',
}

/**
 * "Mandale un codazo": le avisa al dueño (push y cartel en Mi lista) que quieren saber qué regalarle.
 * Si no tiene los avisos activados, ofrece mandarle también un WhatsApp.
 * Solo con nombre: el que no dijo quién es se anota arriba (o, en un navegador donde entró alguien de la lista, entra con
 * Google). Acá no se pide el nombre: cada navegador sin cookie era un invitado nuevo y uno solo llenaba el tope del día.
 */
export function Codazo({ token, para, plural, identified, conGoogle = false, resultado }: {
  token: string
  para: string
  plural: boolean
  identified: boolean
  /** Sin nombre, se identifica entrando con Google (no con "¿Quién sos?"). */
  conGoogle?: boolean
  resultado?: string
}) {
  // solo las claves propias: con ?codazo=__proto__ o valueOf la lista entera daba error
  const mensaje = resultado && Object.hasOwn(RESULTADOS, resultado) ? RESULTADOS[resultado](para) : null
  const wa = encodeURIComponent(`👉 ¡Codazo! Cargá lo que querés en GiftR así sé qué regalarte: ${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/mi-lista`)
  return (
    <section id="codazo" className="flex scroll-mt-6 flex-col gap-2.5">
      {mensaje && <p role="status" className="rounded-2xl bg-gr-ink px-3.5 py-3 text-sm font-semibold text-gr-bg">{mensaje}</p>}
      {resultado === 'cartel' && (
        <a href={`https://wa.me/?text=${wa}`} target="_blank" className="gr-btn min-h-11 gap-2 font-sans text-sm font-bold">
          <Icon name="chat" size={18} strokeWidth={2.4} />Mandale también un WhatsApp
        </a>
      )}
      <div className="gr-sticker flex flex-col gap-2.5 p-3.5">
        <div>
          <p className="font-display text-lg leading-tight font-extrabold">¿{plural ? 'Les' : 'Le'} falta cargar cosas?</p>
          <p className="text-[13px] font-medium leading-snug">
            Mandale{plural ? 's' : ''} un codazo: {plural ? 'les' : 'le'} avisamos a {para} que querés saber qué regalar{plural ? 'les' : 'le'}.
          </p>
        </div>
        {identified ? (
          <form action={codazoAction}>
            <input type="hidden" name="token" value={token} />
            <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">👉 Mandar un codazo</BotonEnviar>
          </form>
        ) : (
          <p className="text-[13px] font-semibold leading-snug">
            Para mandarlo, primero{' '}
            <a href={conGoogle ? '#otra-cuenta' : '#quien-sos'} className="font-bold underline decoration-2 underline-offset-4">
              {conGoogle ? 'entrá con Google' : 'decinos quién sos'}
            </a>
            : así sabe{plural ? 'n' : ''} quién se lo manda.
          </p>
        )}
      </div>
    </section>
  )
}
