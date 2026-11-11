import { TAPA_PERSONA } from '@/lib/tapas'

// Las pantallas de carga. Next las precarga junto con cada link (loading.tsx), así que al tocar un botón aparecen al
// instante mientras llegan los datos. Cada una copia la estructura de la pantalla que viene (la misma barra, los mismos
// altos y márgenes, la misma tapa de color): con una sola silueta para todas, al llegar los datos el logo saltaba del medio
// a la izquierda, la tapa verde aparecía de golpe y los formularios se armaban sobre una grilla que no era. Al abrir la app
// las tapa la animación de inicio, que las reconoce por el <main aria-busy> (ver Arranque).

const Cargando = () => <span className="sr-only" role="status">Cargando…</span>

/** Un bloque de la silueta: gris sobre el fondo; sobre una tapa de color, blanco a medias. */
const gris = (sobreTapa: boolean) => (sobreTapa ? 'bg-white/25' : 'bg-gr-dot')

/** La barra de las secciones del menú (AppHeader): el logo a la izquierda y, a la derecha, los botones redondos y tu foto. */
function BarraApp({ botones, sobreTapa = false }: { botones: number; sobreTapa?: boolean }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <div className={`h-6 w-[78px] rounded-full ${gris(sobreTapa)}`} />
      <div className="flex items-center gap-2">
        {Array.from({ length: botones }, (_, i) => <div key={i} className={`size-10 rounded-full ${gris(sobreTapa)}`} />)}
      </div>
    </div>
  )
}

/** La barra de las pantallas de adentro (PageHeader): volver a la izquierda y el título al medio. */
function BarraPagina() {
  return (
    <div className="grid min-h-14 grid-cols-[48px_1fr_48px] items-center gap-2">
      <div className="size-10 rounded-full bg-gr-dot" />
      <div className="h-5 w-32 justify-self-center rounded-full bg-gr-dot" />
      <span />
    </div>
  )
}

/**
 * Una lista propia con su tapa (Mi lista, una lista en común): la tapa de su color de lado a lado (la de verdad, .gr-tapa,
 * así no cambia de color al llegar) con la barra, el nombre grande y el botón, y abajo la grilla de deseos de a dos, cada
 * uno con su foto más alta que ancha. La de alguien más, que es compacta, tiene la suya (ver SkeletonListaAjena).
 * barra: la del menú (el logo y los botones) o la de una lista en común (volver y agregar).
 * chips: la fila de "Tus listas" de Mi lista. clase: la separación y el aire de abajo de esa pantalla.
 */
export function SkeletonTapa({ color = TAPA_PERSONA, barra = 'menu', chips = false, cards = 4, clase = 'gap-5 pb-36' }: {
  color?: string; barra?: 'menu' | 'volver'; chips?: boolean; cards?: number; clase?: string
}) {
  return (
    <main aria-busy="true" className={`gr-ancha flex flex-col ${clase}`}>
      <Cargando />
      <section aria-hidden="true" className="gr-tapa" style={{ '--c': color } as React.CSSProperties}>
        <div className="motion-safe:animate-pulse">
          {barra === 'menu' ? <BarraApp botones={2} sobreTapa /> : (
            <div className="flex min-h-14 items-center justify-between gap-2">
              <div className="size-10 rounded-full bg-white/25" />
              <div className="size-10 rounded-full bg-white/25" />
            </div>
          )}
          <div className="mt-5 flex flex-col gap-3.5">
            <div className="h-4 w-20 rounded-full bg-white/25" />
            <div className="h-[46px] w-3/5 rounded-2xl bg-white/25" />
            <div className="h-5 w-4/5 rounded-full bg-white/25" />
            <div className="h-[50px] rounded-full bg-white/25 md:w-[320px]" />
          </div>
        </div>
      </section>
      <div aria-hidden="true" className="flex flex-col gap-5 motion-safe:animate-pulse">
        {chips && (
          <div className="-mt-3 flex gap-2 py-1">
            {['w-[76px]', 'w-24', 'w-[136px]'].map((w) => <div key={w} className={`h-[38px] rounded-full bg-gr-dot ${w}`} />)}
          </div>
        )}
        <div className="h-[25px] w-2/5 rounded-full bg-gr-dot" />
        <ul className="grid gr-columnas gap-x-3 gap-y-[18px]">
          {Array.from({ length: cards }, (_, i) => (
            <li key={i} className="flex flex-col gap-2">
              <div className="gr-arte bg-gr-dot" />
              <div className="h-4 w-4/5 rounded-full bg-gr-dot" />
              <div className="h-3 w-1/2 rounded-full bg-gr-dot" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

/**
 * La lista de alguien, como la ve quien regala (/l/[token]): su tapa compacta (el logo al medio, la foto de 56 con el nombre
 * y la cuenta regresiva al lado, y el chip de su perfil) y, montado sobre el fundido de la tapa, la franja de "Decinos quién
 * sos", los chips de los filtros, el buscador y la grilla de deseos. Copiaba la tapa grande de antes (el nombre enorme y el
 * botón de WhatsApp), y al llegar la lista todo subía 150 px de golpe.
 */
export function SkeletonListaAjena({ color = TAPA_PERSONA, cards = 4 }: { color?: string; cards?: number }) {
  return (
    <main aria-busy="true" className="gr-ancha flex flex-col pb-36">
      <Cargando />
      <section aria-hidden="true" className="gr-tapa" style={{ '--c': color } as React.CSSProperties}>
        <div className="motion-safe:animate-pulse">
          <div className="flex min-h-11 items-center justify-center"><div className="h-6 w-[78px] rounded-full bg-white/25" /></div>
          <div className="mt-1 flex items-center gap-3">
            <div className="size-14 flex-none rounded-full bg-white/25" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="h-[26px] w-3/5 rounded-xl bg-white/25" />
              <div className="flex h-[18px] items-center"><div className="h-3 w-4/5 rounded-full bg-white/25" /></div>
            </div>
          </div>
          <div className="mt-2.5 h-9 w-[178px] rounded-full bg-white/25" />
        </div>
      </section>
      <div aria-hidden="true" className="relative -mt-14 flex flex-col gap-4 motion-safe:animate-pulse">
        <div className="h-12 rounded-[22px] bg-gr-dot" />
        <div className="flex gap-2 py-1">
          {['w-[76px]', 'w-[118px]', 'w-[84px]'].map((w) => <div key={w} className={`h-[38px] flex-none rounded-full bg-gr-dot ${w}`} />)}
        </div>
        <div className="h-12 rounded-full bg-gr-dot" />
        <ul className="grid gr-columnas gap-x-3 gap-y-[18px]">
          {Array.from({ length: cards }, (_, i) => (
            <li key={i} className="flex flex-col gap-2">
              <div className="gr-arte bg-gr-dot" />
              <div className="h-4 w-4/5 rounded-full bg-gr-dot" />
              <div className="h-3 w-1/2 rounded-full bg-gr-dot" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

/**
 * Una sección del menú sin tapa (Inicio, Tu gente): la barra con el logo a la izquierda, el título grande con su bajada y,
 * abajo, lo de Inicio (la tarjeta grande de lo próximo, de 268 de alto, y un estante de tarjetas que se deslizan) o, con
 * filas, una lista de filas (Tu gente). botones: cuántos redondos hay a la derecha, contando tu foto.
 */
export function SkeletonInicio({ botones = 3, filas = 0 }: { botones?: number; filas?: number }) {
  return (
    <main aria-busy="true" className={`flex flex-col gap-5 pt-2 ${filas ? 'pb-36' : 'gr-ancha pb-48'}`}>
      <Cargando />
      <div aria-hidden="true" className="flex flex-col gap-5 motion-safe:animate-pulse">
        <BarraApp botones={botones} />
        <div className="flex flex-col gap-1">
          <div className="h-[35px] w-3/5 rounded-2xl bg-gr-dot" />
          <div className="flex h-5 items-center"><div className="h-3.5 w-4/5 rounded-full bg-gr-dot" /></div>
        </div>
        {filas ? (
          Array.from({ length: filas }, (_, i) => <div key={i} className="h-[76px] rounded-[20px] bg-gr-dot" />)
        ) : (
          <>
            <div className="h-[268px] rounded-[26px] bg-gr-dot" />
            <div className="h-[25px] w-2/5 rounded-full bg-gr-dot" />
            <div className="gr-estante">
              {[0, 1, 2].map((i) => <div key={i} className="h-[316px] rounded-[22px] bg-gr-dot" />)}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

/**
 * Un formulario (Agregar y Editar un deseo; con campos, Perfil, la bienvenida y la lista en común nueva): la barra con
 * volver y el título al medio y, abajo, la tarjeta del deseo (el lugar de la foto, el nombre y el precio), cuánto lo
 * querés y el botón; o una tarjeta con la foto redonda y los campos, uno abajo del otro.
 */
export function SkeletonFormulario({ campos = false }: { campos?: boolean }) {
  return (
    <main aria-busy="true" className={`flex flex-col pt-2 ${campos ? 'gap-5 pb-36' : 'gap-1 pb-10'}`}>
      <Cargando />
      <div aria-hidden="true" className={`flex flex-col motion-safe:animate-pulse ${campos ? 'gap-5' : 'gap-1'}`}>
        <BarraPagina />
        {campos ? (
          <>
            <div className="gr-card flex items-center gap-4 p-4">
              <div className="size-[72px] flex-none rounded-full bg-gr-dot" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-5 w-3/5 rounded-full bg-gr-dot" />
                <div className="h-3.5 w-4/5 rounded-full bg-gr-dot" />
              </div>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="gr-card flex flex-col gap-2.5 p-4">
                <div className="h-5 w-2/5 rounded-full bg-gr-dot" />
                <div className="h-[50px] rounded-[14px] bg-gr-dot" />
                <div className="h-3.5 w-3/5 rounded-full bg-gr-dot" />
              </div>
            ))}
          </>
        ) : (
          <div className="mt-1 flex flex-col gap-4">
            <div className="gr-card flex flex-col gap-1.5 p-2.5 pb-2">
              <div className="h-[220px] rounded-[18px] bg-gr-dot" />
              <div className="flex h-12 items-center px-1.5"><div className="h-6 w-3/5 rounded-full bg-gr-dot" /></div>
              <div className="flex h-11 items-center px-1.5"><div className="h-5 w-1/4 rounded-full bg-gr-dot" /></div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-4 w-2/5 rounded-full bg-gr-dot" />
              <div className="flex gap-2">
                {['w-[52px]', 'w-[132px]', 'w-11'].map((w) => <div key={w} className={`h-11 rounded-full bg-gr-dot ${w}`} />)}
              </div>
            </div>
            <div className="h-[64px] rounded-[18px] bg-gr-dot" />
            <div className="mt-4 h-14 rounded-full bg-gr-dot" />
          </div>
        )}
      </div>
    </main>
  )
}

/**
 * Una pantalla de adentro que no es un formulario (Lo nuevo de tus amigos, Todo el año, el perfil de alguien): la barra
 * con volver y el título al medio y, abajo, sus tarjetas, una abajo de la otra. alto: el de cada tarjeta.
 */
export function SkeletonPagina({ cards = 2, alto = 220 }: { cards?: number; alto?: number }) {
  return (
    <main aria-busy="true" className="flex flex-col gap-5 pb-36 pt-2">
      <Cargando />
      <div aria-hidden="true" className="flex flex-col gap-5 motion-safe:animate-pulse">
        <BarraPagina />
        {Array.from({ length: cards }, (_, i) => <div key={i} className="rounded-[20px] bg-gr-dot" style={{ height: alto }} />)}
      </div>
    </main>
  )
}

/** La invitación a una lista en común (Unirme): todo al medio de la pantalla, la foto redonda, el nombre y el botón. */
export function SkeletonInvitacion() {
  return (
    <main aria-busy="true" className="flex min-h-screen flex-col items-center justify-center gap-4 pb-12">
      <Cargando />
      <div aria-hidden="true" className="flex w-full flex-col items-center gap-4 motion-safe:animate-pulse">
        <div className="size-[88px] rounded-full bg-gr-dot" />
        <div className="h-4 w-3/5 rounded-full bg-gr-dot" />
        <div className="h-9 w-2/5 rounded-2xl bg-gr-dot" />
        <div className="h-[104px] w-full rounded-[22px] bg-gr-dot" />
        <div className="mt-2 h-14 w-full rounded-full bg-gr-dot" />
      </div>
    </main>
  )
}

/** La ficha de un deseo mientras llega: la foto a sangre, el nombre, el precio y las fichas (ver FichaDeseo). */
export function SkeletonFicha() {
  return (
    <main aria-busy="true" className="gr-ficha flex flex-col gap-5 pb-36">
      <Cargando />
      <div aria-hidden="true" className="flex flex-col gap-5 motion-safe:animate-pulse">
        <div className="gr-ficha__portada bg-gr-dot" />
        <div className="flex flex-col gap-3">
          <div className="h-9 w-4/5 rounded-full bg-gr-dot" />
          <div className="h-4 w-2/5 rounded-full bg-gr-dot" />
          <div className="h-10 w-1/3 rounded-full bg-gr-dot" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-[104px] rounded-[18px] bg-gr-dot" />
          <div className="h-[104px] rounded-[18px] bg-gr-dot" />
        </div>
      </div>
    </main>
  )
}

/**
 * Lo de abajo de una sección con pestañas (Mis regalos y Cuentas) mientras llega: lo de arriba (el encabezado, el título
 * y las pestañas) ya está en su layout y no se toca. totales: las dos tarjetas de arriba de Cuentas. Es .gr-cargando con
 * aria-busy para que la animación de inicio la reconozca si la app abre acá (ver Arranque).
 */
export function SkeletonContenido({ filas = 3, totales = false }: { filas?: number; totales?: boolean }) {
  return (
    <div aria-busy="true" className="gr-cargando flex flex-col gap-5">
      <Cargando />
      <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
        {totales && (
          <div className="grid grid-cols-2 gap-3">
            <div className="h-[96px] rounded-[26px] bg-gr-dot" />
            <div className="h-[96px] rounded-[26px] bg-gr-dot" />
          </div>
        )}
        <div className="mt-1 h-6 w-2/5 rounded-full bg-gr-dot" />
        {Array.from({ length: filas }, (_, i) => <div key={i} className="h-[76px] rounded-[22px] bg-gr-dot" />)}
      </div>
    </div>
  )
}
