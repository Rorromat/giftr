// "Agregar desde otras apps" en Perfil: cómo se le explica a cada uno que puede compartir a GiftR un link o una foto.
// En Android, con GiftR instalada, aparece sola al tocar Compartir (el share_target del manifest). En iPhone, Safari no
// tiene eso: va un Atajo llamado GiftR que abre /compartir?url=… (ver src/app/compartir/route.ts).

export type Plataforma = 'android' | 'ios'

/**
 * Del user-agent, en el servidor (así la sección viene pintada y no aparece de golpe). La compu da null: no tiene hoja de
 * compartir con GiftR. Un iPad que se presenta como Mac también, porque no hay cómo distinguirlo acá.
 */
export function plataformaDe(ua: string): Plataforma | null {
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  return null
}

export type ComoAgregar = 'android-app' | 'android-boton' | 'android-manual' | 'android-recien' | 'ios-app' | 'ios-safari'

/**
 * Qué explicar. Abierta como app gana (ya está todo). En una pestaña de Android: recién instalada, el botón si Chrome
 * ofrece instalar, o los pasos para hacerlo a mano. En iPhone, el atajo siempre; desde la app de inicio, con la aclaración
 * de que el atajo abre Safari.
 */
export function comoAgregar({ plataforma, instalada, puedeInstalar, recienInstalada }: {
  plataforma: Plataforma | null
  instalada: boolean
  puedeInstalar: boolean
  recienInstalada: boolean
}): ComoAgregar | null {
  if (plataforma === 'ios') return instalada ? 'ios-app' : 'ios-safari'
  if (plataforma !== 'android') return null
  if (instalada) return 'android-app'
  if (recienInstalada) return 'android-recien'
  return puedeInstalar ? 'android-boton' : 'android-manual'
}

export const TEXTOS_APPS = {
  titulo: 'Agregar desde otras apps',
  'android-app': {
    texto: 'Tocá Compartir en MercadoLibre, Instagram o la galería y elegí GiftR: lo sumamos a tu lista.',
    chico: '¿No aparece? Puede tardar un día; si no, desinstalala y volvé a instalarla.',
  },
  'android-boton': {
    texto: 'Instalá GiftR y te va a aparecer cuando toques Compartir en MercadoLibre, Instagram o la galería.',
    boton: 'Instalar GiftR',
  },
  'android-manual': {
    texto: 'Instalala y te va a aparecer cuando toques Compartir en MercadoLibre, Instagram o la galería.',
    chico: 'En Chrome: ⋮ → Instalar y crear acceso directo → Instalar (el acceso directo no aparece al compartir). Si ya la tenés, abrila desde el ícono.',
  },
  'android-recien': { texto: 'Listo: en un ratito te aparece al tocar Compartir.' },
  ios: {
    texto: 'Sumá el atajo de GiftR: tocás Compartir en cualquier app, elegís GiftR y se abre el deseo con el link.',
    boton: 'Sumar el atajo',
    // el botón de Agregar para una foto copiada (ver FotoField)
    chico: '¿Una foto? Copiala y tocá Pegar una foto copiada en Agregar.',
  },
  'ios-app': { texto: 'El atajo abre Safari: entrá a GiftR ahí una vez.' },
  receta: {
    conAtajo: 'Armarlo a mano',
    sinAtajo: 'Cómo armar el atajo',
    alFinal: 'Si no encontrás una acción, buscala con una palabra: url, lista, codificar, texto, abrir.',
  },
} as const

/**
 * El link de iCloud del atajo (https://www.icloud.com/shortcuts/…). Lo arma una vez el dueño en un iPhone, siguiendo la
 * receta de pasosAtajo, lo comparte con "Copiar enlace de iCloud" y lo pega acá. Mientras sea null, Perfil muestra la receta.
 */
export const ATAJO_IPHONE: string | null = null

/** Lo que abre el atajo, con el link codificado al final. Lo atiende el GET de src/app/compartir/route.ts. */
export const entradaAtajo = (base: string) => `${base}/compartir?url=`

/** La receta del atajo, corta, para armarlo en la app Atajos (los nombres de las acciones son los de iOS en español). */
export const pasosAtajo = (base: string): string[] => [
  'Abrí Atajos, tocá + y ponele GiftR.',
  'Tocá ⓘ y activá “Mostrar en la hoja de compartir”.',
  'Arriba, en “Cualquiera”, dejá solo Direcciones URL, Texto y Páginas web de Safari.',
  'Sumá “Obtener URL de la entrada” y “Obtener elemento de la lista” (Primer elemento).',
  'Sumá “Codificar URL”.',
  `Sumá “Texto” con ${entradaAtajo(base)} y la variable “Texto codificado”.`,
  'Sumá “Abrir URL”. Listo: compartí un link y elegí GiftR.',
]
