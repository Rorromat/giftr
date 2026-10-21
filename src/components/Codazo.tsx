import { codazoAction } from '@/app/actions'
import { Icon } from '@/components/ui'
import { NOMBRE_INVITADO_MAXIMO } from '@/lib/types'

const RESULTADOS: Record<string, (para: string) => string> = {
  avisado: (p) => `¡Codazo enviado! A ${p} le llegó un aviso.`,
  cartel: (p) => `¡Codazo enviado! ${p} lo va a ver cuando entre a GiftR.`,
  ya_mandaste: () => 'Ya le diste un codazo hoy. Mañana podés de nuevo.',
  muchos: () => 'Hoy ya le dieron varios codazos. Probá mañana.',
  sin_identidad: () => 'Decinos tu nombre así sabe quién le dio el codazo.',
  nombre_largo: () => `Tu nombre puede tener hasta ${NOMBRE_INVITADO_MAXIMO} letras.`,
}

/**
 * "Mandale un codazo": le avisa al dueño (push y cartel en Mi lista) que quieren saber qué regalarle.
 * Si no tiene los avisos activados, ofrece mandarle también un WhatsApp.
 */
export function Codazo({ token, para, plural, identified, resultado }: {
  token: string
  para: string
  plural: boolean
  identified: boolean
  resultado?: string
}) {
  const mensaje = resultado && RESULTADOS[resultado]?.(para)
  const wa = encodeURIComponent(`👉 ¡Codazo! Cargá lo que querés en GiftR así sé qué regalarte: ${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/mi-lista`)
  return (
    <section id="codazo" className="flex scroll-mt-6 flex-col gap-2.5">
      {mensaje && <p role="status" className="rounded-2xl bg-gr-ink px-3.5 py-3 text-sm font-semibold text-gr-bg">{mensaje}</p>}
      {resultado === 'cartel' && (
        <a href={`https://wa.me/?text=${wa}`} target="_blank" className="gr-btn min-h-11 gap-2 font-sans text-sm font-bold">
          <Icon name="chat" size={18} strokeWidth={2.4} />Mandale también un WhatsApp
        </a>
      )}
      <form action={codazoAction} className="gr-sticker flex flex-col gap-2.5 p-3.5">
        <input type="hidden" name="token" value={token} />
        <div>
          <p className="font-display text-lg leading-tight font-extrabold">¿{plural ? 'Les' : 'Le'} falta cargar cosas?</p>
          <p className="text-[13px] font-medium leading-snug">
            Mandale{plural ? 's' : ''} un codazo: {plural ? 'les' : 'le'} avisamos a {para} que querés saber qué regalar{plural ? 'les' : 'le'}.
          </p>
        </div>
        {!identified && <input name="nombre" required maxLength={NOMBRE_INVITADO_MAXIMO} placeholder="Tu nombre" aria-label="Tu nombre" className="gr-input shadow-none" />}
        <button className="gr-btn-primary gr-btn--sm w-full">👉 Mandar un codazo</button>
      </form>
    </section>
  )
}
