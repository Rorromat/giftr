import { Arte, BackLink, Heart, Icon, PRIORIDADES, type IconName, type Prioridad } from '@/components/ui'
import { FotoAmpliable } from '@/components/FotoAmpliable'
import type { OwnerItemView } from '@/lib/serialize'

// La ficha de un deseo, como se ve al abrirlo: la foto a sangre arriba de todo (volver y compartir encima, de vidrio) que se
// funde con el fondo; el nombre, de qué lista es y el precio en el verde; unas fichas en fila con lo que hace falta saber
// para acertar (cuánto lo quiere, si tiene que ser este mismo o le sirve algo parecido, cuántos pide); su nota, y abajo de
// todo una barra fija con la tienda y la acción principal. La misma en el deseo de otro (quien regala) y en el propio (el
// dueño), cada uno con sus palabras. Server components puros.

/** Quién lo dice: el dueño de lo suyo ("Lo quiero mucho") o quien regala, de un dueño o de varios ("Lo quiere(n) mucho"). */
export type Voz = 'propia' | 'uno' | 'varios'

const segun = (voz: Voz, propia: string, uno: string, varios: string) => (voz === 'propia' ? propia : voz === 'uno' ? uno : varios)

// Las de DetallesDeseo. Un Map: la categoría la escribe el dueño, y "constructor" no tiene que dar algo de Object.prototype.
const ICONO_CATEGORIA = new Map<string, IconName>([
  ['Tecnología', 'celu'], ['Casa', 'home'], ['Ropa', 'shirt'], ['Libros', 'libro'], ['Experiencias', 'entrada'], ['Hobbies', 'palette'],
])
/** El ícono de una categoría; una que no es de las de ahora, una bolsa. */
export const iconoDeCategoria = (categoria: string): IconName => ICONO_CATEGORIA.get(categoria) ?? 'bag'

/**
 * Arriba de todo: la foto a sangre (tocándola se ve entera, ver FotoAmpliable), volver a la izquierda y lo de la derecha
 * (compartir, "Me lo robo"), de vidrio oscuro para que se vean sobre cualquier foto. sello: el de lo que te tocó regalar.
 */
export function FotoDeLaFicha({ foto, titulo, apagado = false, volver, volverLabel, acciones, sello }: {
  foto: string | null
  titulo: string
  apagado?: boolean
  volver: string
  volverLabel: string
  acciones?: React.ReactNode
  sello?: React.ReactNode
}) {
  return (
    <div className="gr-ficha__portada">
      <FotoAmpliable src={foto} titulo={titulo} pastilla className="h-full">
        <Arte src={foto} titulo={titulo} apagado={apagado} className="gr-ficha__foto" />
      </FotoAmpliable>
      <div className="gr-ficha__arriba">
        <BackLink href={volver} label={volverLabel} vidrio="oscuro" />
        <div className="flex gap-2.5">{acciones}</div>
      </div>
      {sello}
    </div>
  )
}

/** El nombre, sobre el final de la foto; abajo, la categoría y de qué lista es (como la dirección), y el precio en el verde. */
export function NombreDeLaFicha({ titulo, categoria, lista, precio }: {
  titulo: string; categoria: string | null; lista: string; precio: string | null
}) {
  return (
    <div className="gr-ficha__nombre">
      <h1 className="gr-title text-[34px] [overflow-wrap:anywhere]">{titulo}</h1>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] text-gr-muted [overflow-wrap:anywhere]">
        {categoria && (
          <>
            <Icon name={iconoDeCategoria(categoria)} size={16} strokeWidth={2.2} className="flex-none" />
            {categoria}
            <span aria-hidden>·</span>
          </>
        )}
        {lista}
      </p>
      {precio && <p className="gr-ficha__precio">{precio}</p>}
    </div>
  )
}

type Ficha = { clave: string; visual: React.ReactNode; titulo: string; sub?: string; alerta?: boolean }

function prioridad(p: Prioridad, voz: Voz): Ficha {
  const quiere = segun(voz, 'quiero', 'quiere', 'quieren')
  const le = segun(voz, 'Me', 'Le', 'Les')
  const titulo = { mucho: `Lo ${quiere} mucho`, gustaria: `${le} gustaría`, suelta: 'Idea suelta' }[p]
  // los tres corazones, llenos los que tiene: se ve en qué punto de la escala está
  const visual = [1, 2, 3].map((n) => (
    <span key={n} className={n <= PRIORIDADES[p].corazones ? '' : 'opacity-25'}><Heart size={14} /></span>
  ))
  return { clave: 'prioridad', visual, titulo }
}

/**
 * Lo que hace falta saber para acertar, en fichas una al lado de la otra (su dibujo en verde, arriba): cuánto lo quiere,
 * si tiene que ser este mismo o le sirve algo parecido y, si pide más de uno o se puede repetir, cuántos. cupo: lo que ve
 * quien ve la coordinación (cuántos quedan, o cuántas reservas hay de más, ver avisoDeCupo); si hay de más, abajo a lo ancho.
 */
export function FichasDeseo({ deseo, voz, cupo }: {
  deseo: Pick<OwnerItemView, 'tipo' | 'prioridad' | 'cantidad' | 'repetible'>
  voz: Voz
  cupo?: { texto: string; alerta: boolean } | null
}) {
  const fichas: Ficha[] = [
    prioridad(deseo.prioridad, voz),
    deseo.tipo === 'idea'
      ? { clave: 'tipo', visual: <Icon name="parecido" size={20} strokeWidth={2.4} />, titulo: `${segun(voz, 'Me', 'Le', 'Les')} sirve algo parecido` }
      : { clave: 'tipo', visual: <Icon name="mira" size={20} strokeWidth={2.2} />, titulo: 'Este mismo' },
  ]
  if (deseo.repetible) {
    fichas.push({ clave: 'cantidad', visual: <Icon name="repetir" size={19} strokeWidth={2.2} />, titulo: 'Se puede repetir' })
  } else if (deseo.cantidad > 1 || cupo) {
    const n = deseo.cantidad
    fichas.push({ clave: 'cantidad', visual: <span className="gr-number text-[18px]">{n}</span>,
      titulo: segun(voz, `Quiero ${n}`, `Pide ${n}`, `Piden ${n}`), sub: cupo && !cupo.alerta ? cupo.texto : undefined })
  }

  return (
    <>
      <ul className="grid auto-cols-fr grid-flow-col gap-2">
        {fichas.map((f) => (
          <li key={f.clave} className="flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-gr-line bg-gr-surface p-3">
            <span aria-hidden className="flex h-10 min-w-10 items-center justify-center gap-0.5 self-start rounded-full bg-gr-soft px-2.5 text-gr-acento-texto">
              {f.visual}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] leading-tight font-semibold [overflow-wrap:anywhere]">{f.titulo}</span>
              {f.sub && <span className="text-[12px] leading-snug text-gr-muted">{f.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
      {cupo?.alerta && (
        <p role="status" className="flex items-start gap-2 text-sm font-semibold">
          <Icon name="users" size={17} className="mt-px flex-none" />{cupo.texto}
        </p>
      )}
    </>
  )
}

/** La nota del deseo, como la descripción: quién la dice ("Euge dice", con su foto al lado si va) y lo que dice. */
export function NotaDeseo({ notas, quien, avatar }: { notas: string; quien: string; avatar?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {/* div, no p: la foto (AvatarSticker) es un div */}
      <div className="flex items-center gap-2 text-[13px] font-semibold text-gr-muted">{avatar}{quien}</div>
      <p className="whitespace-pre-line text-[16px] leading-relaxed text-gr-ink/80 [overflow-wrap:anywhere]">{notas}</p>
    </div>
  )
}

/** Ver el deseo en su tienda, para la barra de abajo: "Verlo en" chiquito y la tienda en grande (así entra en la mitad). */
export function BotonTienda({ link, tienda }: { link: string; tienda: string | null }) {
  return (
    <a href={link} target="_blank" aria-label={`Ver en ${tienda || 'la tienda'}`} className="gr-btn flex-col gap-0 px-4 leading-tight">
      <span className="flex items-center gap-1 text-[12px] font-medium text-gr-muted">
        Verlo en<Icon name="external" size={12} strokeWidth={2.4} />
      </span>
      <span className="max-w-full truncate text-[15px] font-bold">{tienda || 'la tienda'}</span>
    </a>
  )
}

/**
 * La barra fija de abajo, sobre un degradé al fondo: la tienda (secundaria) y la acción principal al lado; con una sola,
 * a lo ancho. Sin ninguna, no va.
 */
export function BarraDeLaFicha({ secundaria, children }: { secundaria?: React.ReactNode; children?: React.ReactNode }) {
  if (!secundaria && !children) return null
  return <div className="gr-ficha__barra">{secundaria}{children}</div>
}
