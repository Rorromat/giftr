// Las propuestas de diseño: cuatro maneras de vestir GiftR con las mismas pantallas. Cada una es un data-tema en <html>
// (los colores, las letras y las formas están en temas.css; los stickers, en stickers/paletas.ts). Sin data-tema, GiftR
// se ve como siempre. Se eligen en /propuestas (o con ?tema=… en cualquier link, y ?tema=actual para volver) y quedan
// guardadas en este navegador.

export const TEMAS = ['sobremesa', 'revista', 'brasa', 'cielo'] as const
export type Tema = (typeof TEMAS)[number]

export const esTema = (t: unknown): t is Tema => typeof t === 'string' && (TEMAS as readonly string[]).includes(t)

export const CLAVE_TEMA = 'gr-tema'

/** El fondo de cada una: también el color de la barra del navegador. */
export const FONDO: Record<Tema | 'actual', string> = {
  actual: '#F4F4F0',
  sobremesa: '#EAE4DC',
  revista: '#E4DFD1',
  brasa: '#1E1E20',
  cielo: '#D3E7F6',
}

export type Propuesta = {
  id: Tema
  nombre: string
  idea: string
  /** la paleta de huemint en la que se basa */
  paleta: string[]
  letras: string
  formas: string
}

export const PROPUESTAS: Propuesta[] = [
  {
    id: 'sobremesa',
    nombre: 'Sobremesa',
    idea: 'Cálida y de familia: lino, petróleo y rosa viejo, con títulos en una serif suave.',
    paleta: ['#EAE4DC', '#0C3D4F', '#C55E66', '#DB9957'],
    letras: 'Fraunces + Instrument Sans',
    formas: 'Curvas grandes, sombras teñidas de petróleo y la barra de abajo oscura.',
  },
  {
    id: 'revista',
    nombre: 'Revista',
    idea: 'Editorial, de suplemento de domingo: papel, oliva y café, con títulos de revista.',
    paleta: ['#E4DFD1', '#B7B86D', '#29201E', '#65554F'],
    letras: 'Instrument Serif + Instrument Sans',
    formas: 'Esquinas rectas, filetes finos en vez de sombras y botones en versalitas.',
  },
  {
    id: 'brasa',
    nombre: 'Brasa',
    idea: 'De noche y con energía: grafito con degradés de brasa que se prenden en lo importante.',
    paleta: ['#1E1E20', '#FB3C20'],
    letras: 'Unbounded + Manrope',
    formas: 'Modo oscuro, vidrio esmerilado en la barra y brillos naranja en los botones.',
  },
  {
    id: 'cielo',
    nombre: 'Cielo',
    idea: 'Pop y juguetona: cielo, rojo y pizarra, con el mismo borde grueso de los stickers.',
    paleta: ['#D3E7F6', '#332C2D', '#EB253B', '#44636D'],
    letras: 'Gabarito + Rubik',
    formas: 'Bordes de 2 px, sombras duras corridas y botones que se hunden al tocarlos.',
  },
]

/**
 * Va inline en el <head> del layout raíz, antes de que se pinte nada: lee ?tema= (y lo guarda) o lo guardado, y pone
 * data-tema en <html> y el color de la barra. Texto fijo, sin datos del pedido.
 */
export const APLICAR_TEMA = `(function(){var T=${JSON.stringify(TEMAS)},F=${JSON.stringify(FONDO)},k=${JSON.stringify(CLAVE_TEMA)},t=null,q=null;
try{q=new URLSearchParams(location.search).get('tema');if(q==='actual')localStorage.removeItem(k);else if(T.indexOf(q)>=0)localStorage.setItem(k,q);t=localStorage.getItem(k)}catch(e){t=q}
if(T.indexOf(t)<0)t=null;var h=document.documentElement;if(t)h.setAttribute('data-tema',t);else h.removeAttribute('data-tema');
function barra(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',F[t||'actual'])}
barra();document.addEventListener('DOMContentLoaded',barra)})()`

// En el navegador

/** La propuesta puesta ahora (null: el diseño de siempre). */
export function temaPuesto(): Tema | null {
  const t = document.documentElement.getAttribute('data-tema')
  return esTema(t) ? t : null
}

/** Pone una propuesta (o vuelve al diseño de siempre con null) y la guarda en este navegador. */
export function ponerTema(t: Tema | null) {
  try {
    if (t) localStorage.setItem(CLAVE_TEMA, t)
    else localStorage.removeItem(CLAVE_TEMA)
  } catch {
    // sin almacenamiento (navegación privada): vale para esta pestaña
  }
  const h = document.documentElement
  if (t) h.setAttribute('data-tema', t)
  else h.removeAttribute('data-tema')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', FONDO[t ?? 'actual'])
}

/** Para useSyncExternalStore: avisa cuando cambia la propuesta. */
export function alCambiarTema(avisar: () => void) {
  const o = new MutationObserver(avisar)
  o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
  return () => o.disconnect()
}
