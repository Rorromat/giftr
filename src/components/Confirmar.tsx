import { BotonEnviar } from '@/components/BotonEnviar'

/**
 * Para lo que no se deshace con un toque (salir del grupo, cambiar un link): el primero abre la explicación y el botón
 * de verdad está adentro. Con details, sin JavaScript.
 */
export function Confirmar({ resumen, boton, action, ocultos, children, className = '' }: {
  resumen: string
  boton: string
  action: (formData: FormData) => Promise<void>
  ocultos: Record<string, string>
  children: React.ReactNode
  className?: string
}) {
  return (
    <details className={`group flex flex-col ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden">
        {resumen}
      </summary>
      <form action={action} className="mt-1 flex flex-col gap-2.5 rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface p-3 text-left">
        {Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <p className="text-[13px] font-medium leading-snug">{children}</p>
        <BotonEnviar className="gr-btn-primary gr-btn--sm w-full rounded-[14px]">{boton}</BotonEnviar>
      </form>
    </details>
  )
}
