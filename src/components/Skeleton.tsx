// Pantalla de carga con la silueta del sistema visual: la barra de arriba, la tarjeta destacada y la grilla. Next la
// precarga junto con cada link (loading.tsx), así que al tocar un botón aparece al instante mientras llegan los datos. Al
// abrir la app la tapa la animación de inicio, que la reconoce por el <main aria-busy> (ver Arranque).
export function SkeletonPage({ cards = 4 }: { cards?: number }) {
  return (
    <main aria-busy="true" className="flex flex-col gap-5 pb-36 pt-2">
      <span className="sr-only" role="status">Cargando…</span>
      <div aria-hidden="true" className="flex flex-col gap-5 motion-safe:animate-pulse">
        <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center">
          <span />
          <div className="h-7 w-24 rounded-full bg-gr-dot" />
          <div className="size-10 justify-self-end rounded-full bg-gr-dot" />
        </div>
        <div className="h-[208px] rounded-[26px] bg-gr-dot" />
        <div className="h-6 w-2/5 rounded-full bg-gr-dot" />
        <ul className="grid grid-cols-2 gap-3">
          {Array.from({ length: cards }, (_, i) => (
            <li key={i} className="gr-card">
              <div className="h-[176px] bg-gr-dot" />
              <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
                <div className="h-4 w-4/5 rounded-full bg-gr-dot" />
                <div className="h-3 w-1/2 rounded-full bg-gr-dot" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

/** La ficha de un deseo mientras llega: la foto a sangre, el nombre, el precio y las fichas (ver FichaDeseo). */
export function SkeletonFicha() {
  return (
    <main aria-busy="true" className="flex flex-col gap-5 pb-36">
      <span className="sr-only" role="status">Cargando…</span>
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
      <span className="sr-only" role="status">Cargando…</span>
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
