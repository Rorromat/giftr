import { Heart, Icon, PRIORIDADES, type IconName, type Prioridad } from '@/components/ui'
import type { OwnerItemView } from '@/lib/serialize'

// La ficha de un deseo, como se ve al abrirlo: la categoría arriba del nombre, unas fichas con lo que hace falta saber para
// acertar (cuánto lo quiere, si tiene que ser este mismo o le sirve algo parecido, cuántos pide) y su nota, como un
// mensaje suyo. La misma en el deseo de otro (quien regala) y en el propio (el dueño), cada uno con sus palabras.
// Server components puros.

/** Quién lo dice: el dueño de lo suyo ("Lo quiero mucho") o quien regala, de un dueño o de varios ("Lo quiere(n) mucho"). */
export type Voz = 'propia' | 'uno' | 'varios'

const segun = (voz: Voz, propia: string, uno: string, varios: string) => (voz === 'propia' ? propia : voz === 'uno' ? uno : varios)

// Las de DetallesDeseo. Un Map: la categoría la escribe el dueño, y "constructor" no tiene que dar algo de Object.prototype.
const ICONO_CATEGORIA = new Map<string, IconName>([
  ['Tecnología', 'celu'], ['Casa', 'home'], ['Ropa', 'shirt'], ['Libros', 'libro'], ['Experiencias', 'entrada'], ['Hobbies', 'palette'],
])

/** La categoría, arriba del nombre, con su ícono (una que no es de las de ahora, con una bolsa). */
export function CategoriaDeseo({ categoria }: { categoria: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 self-start rounded-full border border-gr-line bg-gr-surface py-1 pl-2 pr-3 text-[13px] font-semibold [overflow-wrap:anywhere]">
      <Icon name={ICONO_CATEGORIA.get(categoria) ?? 'bag'} size={15} strokeWidth={2.2} className="flex-none" />{categoria}
    </p>
  )
}

type Ficha = { clave: string; visual: React.ReactNode; titulo: string; sub?: string; alerta?: boolean; oscura?: boolean }

function prioridad(p: Prioridad, voz: Voz): Ficha {
  const quiere = segun(voz, 'quiero', 'quiere', 'quieren')
  const le = segun(voz, 'Me', 'Le', 'Les')
  const textos = {
    mucho: { titulo: `Lo ${quiere} mucho`, sub: `Es de lo que más ${quiere}` },
    gustaria: { titulo: `${le} gustaría`, sub: `${le} vendría bien tenerlo` },
    suelta: { titulo: 'Idea suelta', sub: voz === 'propia' ? 'Por si no saben qué regalarte' : 'Por si no sabés qué regalar' },
  }[p]
  const oscura = p === 'mucho'
  // los tres corazones, llenos los que tiene: se ve en qué punto de la escala está
  const visual = (
    <span className="flex gap-1">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= PRIORIDADES[p].corazones ? (oscura ? 'text-gr-acento-sobre-tinta' : 'text-gr-ink') : 'opacity-25'}>
          <Heart size={18} />
        </span>
      ))}
    </span>
  )
  return { clave: 'prioridad', visual, oscura, ...textos }
}

const Circulo = ({ children }: { children: React.ReactNode }) => (
  <span className="flex size-8 items-center justify-center rounded-full bg-gr-surface">{children}</span>
)

/**
 * Lo que hace falta saber para acertar, en fichas: cuánto lo quiere (la de "mucho", oscura, como su etiqueta), si tiene
 * que ser este mismo o le sirve algo parecido y, si pide más de uno o se puede repetir, cuántos. cupo: lo que ve quien ve
 * la coordinación (cuántos quedan, o cuántas reservas hay de más, ver avisoDeCupo).
 */
export function FichasDeseo({ deseo, voz, cupo }: {
  deseo: Pick<OwnerItemView, 'tipo' | 'prioridad' | 'cantidad' | 'repetible'>
  voz: Voz
  cupo?: { texto: string; alerta: boolean } | null
}) {
  const fichas: Ficha[] = [
    prioridad(deseo.prioridad, voz),
    deseo.tipo === 'idea'
      ? { clave: 'tipo', visual: <Circulo><Icon name="parecido" size={18} strokeWidth={2.4} /></Circulo>,
          titulo: `${segun(voz, 'Me', 'Le', 'Les')} sirve algo parecido`, sub: 'No tiene que ser este mismo' }
      : { clave: 'tipo', visual: <Circulo><Icon name="mira" size={18} strokeWidth={2.2} /></Circulo>,
          titulo: 'Este mismo', sub: 'Exactamente este, no otro parecido' },
  ]
  if (deseo.repetible) {
    fichas.push({ clave: 'cantidad', visual: <Circulo><Icon name="repetir" size={17} strokeWidth={2.2} /></Circulo>,
      titulo: 'Se puede repetir', sub: voz === 'propia' ? 'Varios pueden regalarte algo así' : 'Varios pueden regalar algo así' })
  } else if (deseo.cantidad > 1 || cupo) {
    const n = deseo.cantidad
    fichas.push({ clave: 'cantidad', visual: <Circulo><span className="gr-number text-[17px]">{n}</span></Circulo>,
      titulo: segun(voz, `Quiero ${n}`, `Pide ${n}`, `Piden ${n}`), sub: cupo?.texto, alerta: cupo?.alerta })
  }

  return (
    <ul className="grid grid-cols-2 gap-2">
      {fichas.map((f, i) => {
        // con un número impar, la última va a lo ancho: el dibujo a la izquierda y el texto al lado
        const ancha = fichas.length % 2 === 1 && i === fichas.length - 1
        return (
          <li key={f.clave}
              className={`flex rounded-[18px] p-3 ${ancha ? 'col-span-2 items-center gap-3' : 'flex-col gap-2'} ${f.oscura ? 'bg-gr-brand text-gr-on-brand' : 'border border-gr-line bg-gr-surface'}`}>
            <span aria-hidden className="flex h-8 flex-none items-center">{f.visual}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] leading-tight font-bold">{f.titulo}</span>
              {f.sub && (
                <span className={`text-[13px] leading-snug ${f.alerta ? 'font-semibold' : f.oscura ? 'text-gr-on-brand/70' : 'text-gr-muted'}`}>{f.sub}</span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** La nota del deseo, como un mensaje: quién la dice ("Euge dice") con su foto al lado, si va. */
export function NotaDeseo({ notas, quien, avatar }: { notas: string; quien: string; avatar?: React.ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      {avatar}
      <div className="min-w-0 flex-1 rounded-[18px] rounded-bl-md border border-gr-line bg-gr-surface px-3.5 py-2.5">
        <p className="text-xs font-semibold text-gr-muted">{quien}</p>
        <p className="mt-0.5 whitespace-pre-line text-[15px] leading-snug [overflow-wrap:anywhere]">{notas}</p>
      </div>
    </div>
  )
}
