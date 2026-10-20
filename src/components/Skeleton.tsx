// Pantalla de carga con la silueta del sistema Sticker. Next la precarga junto con cada link
// (loading.tsx), así que al tocar un botón aparece al instante mientras llegan los datos.
export function SkeletonPage({ cards = 4 }: { cards?: number }) {
  return (
    <main aria-busy="true" className="flex flex-col gap-3.5 pb-32 pt-[52px]">
      <span className="sr-only" role="status">Cargando…</span>
      <div aria-hidden="true" className="flex flex-col gap-3.5 motion-safe:animate-pulse">
        <div className="h-11 w-36 rounded-[14px] bg-gr-dot" />
        <div className="flex flex-col gap-2">
          <div className="h-10 w-3/5 rounded-xl bg-gr-dot" />
          <div className="h-4 w-4/5 rounded-full bg-gr-dot" />
        </div>
        <ul className="mt-1.5 grid grid-cols-2 items-start gap-x-3.5 gap-y-5 pr-[5px]">
          {Array.from({ length: cards }, (_, i) => (
            <li key={i} className="gr-sticker even:mt-[18px]">
              <div className="bg-gr-dot" style={{ height: i % 3 ? 150 : 182 }} />
              <div className="flex flex-col gap-1.5 px-[11px] pb-[11px] pt-[9px]">
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
