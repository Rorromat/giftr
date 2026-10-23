'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { alCambiarPedido, instalada, instalarGiftR, puedeInstalar } from '@/lib/app-instalable'
import { comoAgregar, entradaAtajo, pasosAtajo, TEXTOS_APPS, type Plataforma } from '@/lib/agregar-desde-apps'

// En el servidor no se sabe si está instalada ni si Chrome ofrece instalar: se pinta lo de una pestaña sin el ofrecimiento.
const enElServidor = () => false
// Abierta como app o en una pestaña: no cambia mientras se mira la página.
const sinCambios = () => () => {}

const ANDROID = ['android-manual', 'android-boton', 'android-app', 'android-recien'] as const

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
      // Todas en la misma celda y solo una visible: mide siempre lo de la más alta, así lo que se sabe recién en el navegador
      // (si está instalada, y el ofrecimiento de Chrome, que llega cuando quiere) no corre lo de abajo.
      <div className="grid">
        {ANDROID.map((v) => (
          <div key={v} className={`col-start-1 row-start-1 flex flex-col gap-2${v === estado ? '' : ' invisible'}`}>{android(v)}</div>
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
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden">
          {atajo ? TEXTOS_APPS.receta.conAtajo : TEXTOS_APPS.receta.sinAtajo}
        </summary>
        <ol className={`${texto} flex list-decimal flex-col gap-1 pl-5`}>
          {pasosAtajo(base).map((paso) => {
            // la dirección, de un toque entera para copiarla y pegarla en Atajos
            const [antes, despues] = paso.split(entrada)
            return (
              <li key={paso}>
                {despues === undefined ? paso : <>{antes}<code className="select-all font-sans font-bold [overflow-wrap:anywhere]">{entrada}</code>{despues}</>}
              </li>
            )
          })}
        </ol>
        <p className={`${chico} mt-2`}>{TEXTOS_APPS.receta.alFinal}</p>
      </details>
    </>
  )
}
