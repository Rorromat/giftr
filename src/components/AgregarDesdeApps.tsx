'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { alCambiarPedido, instalada, instalarGiftR, puedeInstalar } from '@/lib/app-instalable'
import { comoAgregar, entradaAtajo, pasosAtajo, TEXTOS_APPS, type Plataforma } from '@/lib/agregar-desde-apps'
import { CopyLinkButton } from '@/components/CopyLinkButton'

// En el servidor no se sabe si está instalada ni si Chrome ofrece instalar: se pinta lo de una pestaña sin el ofrecimiento.
const enElServidor = () => false
// Abierta como app o en una pestaña: no cambia mientras se mira la página.
const sinCambios = () => () => {}

const ANDROID = ['android-manual', 'android-boton', 'android-app', 'android-recien'] as const

const EN_APP_SI = '[@media(display-mode:standalone)]:visible'
const EN_APP_NO = '[@media(display-mode:standalone)]:hidden'

const texto = 'text-[13px] font-medium leading-snug'
const chico = 'text-xs font-medium leading-snug text-gr-muted'

/** "Agregar desde otras apps" en Perfil: cómo sumar a la lista un link o una foto desde Compartir (ver comoAgregar). */
export function AgregarDesdeApps({ plataforma, base, atajo }: { plataforma: Plataforma; base: string; atajo: string | null }) {
  const enApp = useSyncExternalStore(sinCambios, instalada, enElServidor)
  const ofrece = useSyncExternalStore(alCambiarPedido, puedeInstalar, enElServidor)
  const [recien, setRecien] = useState(false)
  useEffect(() => {
    // también si la instala desde el menú de Chrome con Perfil abierto
    const listo = () => setRecien(true)
    window.addEventListener('appinstalled', listo)
    return () => window.removeEventListener('appinstalled', listo)
  }, [])
  const estado = comoAgregar({ plataforma, instalada: enApp, puedeInstalar: ofrece, recienInstalada: recien })

  async function instalar() {
    if (await instalarGiftR()) setRecien(true)
  }

  function android(v: (typeof ANDROID)[number]) {
    switch (v) {
      case 'android-app':
      case 'android-manual':
        return <><p className={texto}>{TEXTOS_APPS[v].texto}</p><p className={chico}>{TEXTOS_APPS[v].chico}</p></>
      case 'android-boton':
        return (
          <>
            <p className={texto}>{TEXTOS_APPS[v].texto}</p>
            <button type="button" onClick={instalar} className="gr-btn-primary gr-btn--sm w-full">{TEXTOS_APPS[v].boton}</button>
          </>
        )
      case 'android-recien':
        return <p className={`${texto} font-semibold`}>{TEXTOS_APPS[v].texto}</p>
    }
  }

  if (plataforma === 'android') {
    return (
      // En una pestaña, todas en la misma celda y solo una visible: mide siempre lo de la más alta, así el ofrecimiento de
      // Chrome, que llega cuando quiere, no corre lo de abajo. En la app abierta desde el ícono ese ofrecimiento no llega, y
      // el servidor no sabe que está instalada: el CSS muestra la suya antes de pintar y saca las otras (sin hueco abajo).
      <div className="grid">
        {ANDROID.map((v) => (
          <div key={v} className={`col-start-1 row-start-1 flex flex-col gap-2${v === estado ? '' : ' invisible'} ${v === 'android-app' ? EN_APP_SI : EN_APP_NO}`}>
            {android(v)}
          </div>
        ))}
      </div>
    )
  }

  const entrada = entradaAtajo(base)
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className={texto}>{TEXTOS_APPS.ios.texto}</p>
        {/* Solo en la GiftR de inicio. La muestra el CSS, antes de pintar (así no corre nada y en Safari no queda el hueco);
            instalada() la cubre donde display-mode no anda. */}
        <p className={`${texto}${estado === 'ios-app' ? '' : ' hidden [@media(display-mode:standalone)]:block'}`}>{TEXTOS_APPS['ios-app'].texto}</p>
        {atajo && <a href={atajo} className="gr-btn-primary gr-btn--sm w-full">{TEXTOS_APPS.ios.boton}</a>}
        <p className={chico}>{TEXTOS_APPS.ios.chico}</p>
      </div>
      <details open={!atajo} className="group flex flex-col">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          {atajo ? TEXTOS_APPS.receta.conAtajo : TEXTOS_APPS.receta.sinAtajo}
        </summary>
        <ol className={`${texto} flex list-decimal flex-col gap-1 pl-5`}>
          {pasosAtajo(base).map((paso) => {
            // La dirección, en su renglón y con Copiar, para pegarla en Atajos sin escribirla. Se corta en cualquier letra:
            // cortada en el guion de giftr-seven parecía un corte de palabra. Manteniéndola apretada se selecciona entera.
            const [antes, despues] = paso.split(entrada)
            if (despues === undefined) return <li key={paso}>{paso}</li>
            return (
              <li key={paso}>
                {antes.trim()}
                <span className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 select-all break-all">{entrada}</code>
                  <CopyLinkButton url={entrada} />
                </span>
                {despues.trim()}
              </li>
            )
          })}
        </ol>
        <p className={`${chico} mt-2`}>{TEXTOS_APPS.receta.alFinal}</p>
      </details>
    </>
  )
}
