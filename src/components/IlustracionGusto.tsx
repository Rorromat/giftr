import { useId } from 'react'
import { paletaGusto } from '@/lib/colores-gustos'
import type { PasoGustos } from '@/lib/gustos'

// Las ilustraciones de cada paso de los gustos, con las reglas de las de las fechas especiales (ver IlustracionFecha):
// - todo adentro del mismo círculo guía, con su sombra en el piso (del color del paso, ver colores-gustos.ts);
// - la luz viene de arriba a la izquierda: la mitad derecha de cada objeto va un tono más oscura;
// - formas redondeadas, sin puntas.
// Cada una es una sola idea: la torta con su vela (tu cumple), la paleta de pádel con la pelotita (deportes), la camiseta
// celeste y blanca con las tres estrellas y la pelota (fútbol), los auriculares con notas (hobbies), la bolsa de compras
// con papel de seda (marcas y estilo), la remera con su etiqueta de talle y muestras de color (colores y talles), el
// cafecito con una medialuna (bebidas y antojos) y las tazas apiladas con el sello de "prohibido" (lo que no querés: otra
// taza, no).

const BLANCO = '#FFFFFF'
const BLANCO_SOMBRA = '#E6E2DA'
const TINTA = '#141414'
const LIMA = '#C8F31D'

/** Un destello de cuatro puntas. */
const Destello = ({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) => (
  <path fill={fill} d={`M${cx} ${cy - s} Q${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy} Q${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s} `
    + `Q${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy} Q${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s}Z`} />
)

/** Una estrellita de cinco puntas redondeadas (las de la camiseta). */
const Estrellita = ({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) => {
  const puntos = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI * i) / 5 - Math.PI / 2
    const d = i % 2 ? r * 0.45 : r
    return `${(cx + d * Math.cos(a)).toFixed(1)},${(cy + d * Math.sin(a)).toFixed(1)}`
  }).join(' ')
  return <polygon points={puntos} fill={fill} stroke={fill} strokeWidth={r * 0.3} strokeLinejoin="round" />
}

/** La ilustración de un paso de los gustos, de 160 de lado. */
export function IlustracionGusto({ paso, size = 150, className = '' }: { paso: PasoGustos; size?: number; className?: string }) {
  // ids propios para los recortes: puede haber varias en la misma pantalla
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const mitad = (x: number) => <clipPath id={`${id}-m${x}`}><rect x={x} y="0" width={160 - x} height="160" /></clipPath>
  const enSombra = (x: number) => `url(#${id}-m${x})`
  const paleta = paletaGusto(paso)
  // la misma forma dos veces: entera con luz y, recortada a la derecha, en sombra
  const conSombra = (d: string, luz: string, sombra: string, x = 80) => (
    <><path d={d} fill={luz} /><path d={d} fill={sombra} clipPath={enSombra(x)} /></>
  )
  const escenario = (
    <>
      <circle cx="80" cy="80" r="58" fill={paleta.marco} />
      <ellipse cx="80" cy="135" rx="44" ry="6" fill={paleta.piso} />
    </>
  )

  let dibujo: React.ReactNode
  switch (paso) {
    case 'cumple': {
      const bizcochuelo = '#FFF1DA', bizcochueloSombra = '#F0D9B5', glaseado = '#FF8FB1', glaseadoSombra = '#F06E98'
      const llama = paleta.acento, llamaAdentro = '#FF922B'
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          {escenario}
          <ellipse cx="80" cy="130" rx="44" ry="6" fill={BLANCO} />
          {conSombra('M46 92 H114 V122 Q114 130 106 130 H54 Q46 130 46 122 Z', bizcochuelo, bizcochueloSombra)}
          {/* el relleno */}
          <rect x="46" y="110" width="68" height="5" fill={glaseado} opacity="0.7" />
          {/* el glaseado, con sus chorreadas */}
          {conSombra('M46 90 Q46 80 56 80 H104 Q114 80 114 90 V96 Q114 102 108 100 Q103 98 103 104 Q103 110 98 110 Q93 110 93 104 V100 '
            + 'Q93 96 88 96 H72 Q67 96 67 102 Q67 108 62 108 Q57 108 57 102 V100 Q57 97 52 99 Q46 101 46 96 Z', glaseado, glaseadoSombra)}
          <rect x="60" y="86" width="5" height="2.6" rx="1.3" fill={BLANCO} transform="rotate(-25 62 87)" />
          <rect x="86" y="84" width="5" height="2.6" rx="1.3" fill={llama} transform="rotate(20 88 85)" />
          <rect x="100" y="88" width="5" height="2.6" rx="1.3" fill={BLANCO} transform="rotate(-10 102 89)" />
          <rect x="72" y="89" width="5" height="2.6" rx="1.3" fill={LIMA} transform="rotate(35 74 90)" />
          {/* la vela */}
          <rect x="75" y="52" width="10" height="30" rx="3" fill={BLANCO} />
          <g clipPath={`url(#${id}-vela)`} stroke={glaseado} strokeWidth="3.5"><path d="M70 60 L90 52 M70 69 L90 61 M70 78 L90 70" /></g>
          <defs><clipPath id={`${id}-vela`}><rect x="75" y="52" width="10" height="30" rx="3" /></clipPath></defs>
          <path d="M80 30 C88 39 89 47 80 50 C71 47 72 39 80 30 Z" fill={llama} />
          <path d="M80 39 C84 43 84 47 80 48 C76 47 76 43 80 39 Z" fill={llamaAdentro} />
          <Destello cx={112} cy={46} s={6} fill={BLANCO} /><Destello cx={44} cy={60} s={4} fill={llama} />
        </>
      )
      break
    }
    case 'deportes': {
      const cabeza = BLANCO, cabezaSombra = BLANCO_SOMBRA, marco = '#FF6B4A', pelota = paleta.acento, pelotaSombra = '#C9D33E'
      const paleta_ = 'M80 26 C102 26 110 44 110 60 C110 80 96 92 80 92 C64 92 50 80 50 60 C50 44 58 26 80 26 Z'
      const agujeros = [[70, 46], [80, 42], [90, 46], [66, 57], [76, 55], [86, 55], [96, 57], [70, 68], [80, 66], [90, 68], [76, 78], [86, 78]]
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          {escenario}
          <g transform="rotate(-28 80 80)">
            {/* el puño y el cuello */}
            <path d="M74 90 L80 100 L86 90" fill={marco} stroke={marco} strokeWidth="6" strokeLinejoin="round" />
            <rect x="74" y="98" width="12" height="38" rx="5" fill={TINTA} />
            <path d="M74 106 L86 102 M74 114 L86 110 M74 122 L86 118 M74 130 L86 126" stroke={LIMA} strokeWidth="2.2" strokeLinecap="round" />
            <path d={paleta_} fill={marco} stroke={marco} strokeWidth="9" strokeLinejoin="round" />
            {conSombra(paleta_, cabeza, cabezaSombra)}
            {agujeros.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={paleta.marco} />)}
          </g>
          {/* la pelotita */}
          <circle cx="114" cy="114" r="13" fill={pelota} />
          <path d="M114 101 A13 13 0 0 1 127 114 A13 13 0 0 1 114 127 Z" fill={pelotaSombra} />
          <path d="M103 107 Q111 114 103 121 M125 107 Q117 114 125 121" stroke={BLANCO} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <Destello cx={44} cy={52} s={5} fill={BLANCO} />
        </>
      )
      break
    }
    case 'futbol': {
      const celeste = paleta.acento, celesteSombra = '#5E93C4', dorado = '#FFC94A'
      const camiseta = 'M46 56 L64 46 Q80 54 96 46 L114 56 L126 76 L112 84 L110 80 V128 Q110 132 106 132 H54 Q50 132 50 128 V80 L48 84 L34 76 Z'
      dibujo = (
        <>
          <defs>{mitad(80)}<clipPath id={`${id}-camiseta`}><path d={camiseta} /></clipPath></defs>
          {escenario}
          <path d={camiseta} fill={BLANCO} stroke={BLANCO} strokeWidth="6" strokeLinejoin="round" />
          {/* las rayas celestes */}
          <g clipPath={`url(#${id}-camiseta)`}>
            {[52, 70, 88, 106].map((x) => <rect key={x} x={x} y="40" width="9" height="100" fill={celeste} />)}
            <g clipPath={enSombra(80)}>
              <rect x="80" y="40" width="50" height="100" fill={TINTA} opacity="0.08" />
              {[88, 106].map((x) => <rect key={x} x={x} y="40" width="9" height="100" fill={celesteSombra} />)}
            </g>
          </g>
          <path d="M68 49 Q80 62 92 49" fill="none" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
          {/* las tres estrellas */}
          <Estrellita cx={89} cy={66} r={3.4} fill={dorado} /><Estrellita cx={97} cy={66} r={3.4} fill={dorado} /><Estrellita cx={105} cy={66} r={3.4} fill={dorado} />
          {/* la pelota */}
          <defs><clipPath id={`${id}-pelota`}><circle cx="116" cy="118" r="16" /></clipPath></defs>
          <circle cx="116" cy="118" r="16" fill={BLANCO} />
          <g clipPath={`url(#${id}-pelota)`} fill={TINTA}>
            <polygon points="116,112 122,116.5 119.7,123.5 112.3,123.5 110,116.5" stroke={TINTA} strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="116" cy="100" r="5.5" /><circle cx="133" cy="113" r="5.5" /><circle cx="127" cy="134" r="5.5" />
            <circle cx="105" cy="134" r="5.5" /><circle cx="99" cy="113" r="5.5" />
            <path d="M116 102 A16 16 0 0 1 132 118 A16 16 0 0 1 116 134 Z" fill={TINTA} opacity="0.12" />
          </g>
          <Destello cx={40} cy={50} s={5} fill={BLANCO} />
        </>
      )
      break
    }
    case 'hobbies': {
      const acento = paleta.acento, acentoSombra = '#A3C90B', copa = BLANCO, copaSombra = BLANCO_SOMBRA
      const nota = (x: number, y: number, fill: string) => (
        <g fill={fill}>
          <ellipse cx={x} cy={y} rx="6" ry="4.6" transform={`rotate(-20 ${x} ${y})`} />
          <rect x={x + 3.6} y={y - 22} width="3.4" height="22" rx="1.7" />
          <path d={`M${x + 5} ${y - 22} Q${x + 15} ${y - 18} ${x + 13} ${y - 8}`} stroke={fill} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        </g>
      )
      dibujo = (
        <>
          {escenario}
          {nota(50, 52, acento)}{nota(108, 44, BLANCO)}
          {/* la vincha */}
          <path d="M44 100 C44 58 116 58 116 100" fill="none" stroke={TINTA} strokeWidth="10" strokeLinecap="round" />
          <path d="M44 100 C44 58 116 58 116 100" fill="none" stroke={copa} strokeWidth="5" strokeLinecap="round" />
          {/* las copas */}
          <rect x="34" y="88" width="24" height="40" rx="11" fill={copa} />
          <rect x="49" y="94" width="13" height="28" rx="6" fill={acento} />
          <rect x="102" y="88" width="24" height="40" rx="11" fill={copaSombra} />
          <rect x="98" y="94" width="13" height="28" rx="6" fill={acentoSombra} />
          <Destello cx={80} cy={40} s={5} fill={acento} />
        </>
      )
      break
    }
    case 'ropa': {
      const bolsa = '#FFF4E6', bolsaSombra = '#F0DCC2', seda = paleta.acento, sedaSombra = '#A3C90B'
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          {escenario}
          {/* las manijas, de soga */}
          <path d="M62 74 C62 44 98 44 98 74" fill="none" stroke={TINTA} strokeWidth="5" strokeLinecap="round" />
          {/* el papel de seda que asoma */}
          <polygon points="56,76 62,58 72,68 80,50 88,66 98,56 104,76" fill={seda} stroke={seda} strokeWidth="5" strokeLinejoin="round" />
          <g clipPath={enSombra(80)}><polygon points="56,76 62,58 72,68 80,50 88,66 98,56 104,76" fill={sedaSombra} stroke={sedaSombra} strokeWidth="5" strokeLinejoin="round" /></g>
          {conSombra('M46 72 H114 L118 126 Q118 133 111 133 H49 Q42 133 42 126 Z', bolsa, bolsaSombra)}
          {/* la etiqueta de la marca: la estrella de GiftR */}
          <circle cx="80" cy="106" r="14" fill={paleta.fondo} />
          <polygon fill={LIMA} points={Array.from({ length: 24 }, (_, i) => {
            const r = i % 2 ? 5.4 : 8.6
            const a = (Math.PI * i) / 12 - Math.PI / 2
            return `${(80 + r * Math.cos(a)).toFixed(1)},${(106 + r * Math.sin(a)).toFixed(1)}`
          }).join(' ')} />
          <Destello cx={120} cy={50} s={6} fill={BLANCO} /><Destello cx={38} cy={62} s={4} fill={seda} />
        </>
      )
      break
    }
    case 'colores': {
      const remera = paleta.acento, remeraSombra = '#E8B52C'
      const forma = 'M50 54 L66 46 Q80 54 94 46 L110 54 L126 72 L112 82 L108 78 V128 Q108 132 104 132 H56 Q52 132 52 128 V78 L48 82 L34 72 Z'
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          {escenario}
          <path d={forma} fill={remera} stroke={remera} strokeWidth="6" strokeLinejoin="round" />
          <g clipPath={enSombra(80)}><path d={forma} fill={remeraSombra} stroke={remeraSombra} strokeWidth="6" strokeLinejoin="round" /></g>
          <path d="M68 48 Q80 60 92 48" fill="none" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
          {/* la etiqueta del talle, colgando del cuello */}
          <path d="M88 53 L100 64" stroke={TINTA} strokeWidth="2" />
          <g transform="rotate(-14 104 74)">
            <rect x="92" y="62" width="24" height="26" rx="5" fill={BLANCO} />
            <circle cx="104" cy="67" r="2" fill={paleta.marco} />
            <text x="104" y="84" textAnchor="middle" fontSize="15" fontWeight="800" fill={TINTA} style={{ fontFamily: 'var(--gr-font-display), system-ui, sans-serif' }}>M</text>
          </g>
          {/* el abanico de muestras */}
          {[['#FF6B6B', -24], ['#4DABF7', -8], [LIMA, 8]].map(([color, giro]) => (
            <rect key={color} x="40" y="92" width="16" height="36" rx="5" fill={color as string} stroke={BLANCO} strokeWidth="2.5"
                  transform={`rotate(${giro} 48 126)`} />
          ))}
          <circle cx="48" cy="124" r="2.5" fill={BLANCO} />
          <Destello cx={122} cy={44} s={5} fill={BLANCO} />
        </>
      )
      break
    }
    case 'bebidas': {
      const taza = BLANCO, tazaSombra = BLANCO_SOMBRA, cafe = '#6B3E26', medialuna = '#E8A94B', medialunaSombra = '#C98530'
      dibujo = (
        <>
          <defs>{mitad(78)}</defs>
          {escenario}
          {/* el vapor */}
          <g stroke={BLANCO} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.85">
            <path d="M70 66 C64 58 76 52 70 42" /><path d="M86 66 C80 58 92 52 86 42" />
          </g>
          {/* el plato y la taza */}
          <ellipse cx="80" cy="127" rx="42" ry="7" fill={taza} />
          <ellipse cx="80" cy="127" rx="42" ry="7" fill={tazaSombra} clipPath={enSombra(78)} />
          <path d="M104 84 C124 84 124 112 102 110" fill="none" stroke={tazaSombra} strokeWidth="7" strokeLinecap="round" />
          {conSombra('M50 76 H106 V100 Q106 124 78 124 Q50 124 50 100 Z', taza, tazaSombra, 78)}
          <ellipse cx="78" cy="77" rx="28" ry="5" fill={cafe} />
          {/* una medialuna en el plato */}
          <path d="M26 128 Q26 108 46 106 Q66 108 66 128 Q60 120 46 120 Q32 120 26 128 Z" fill={medialuna}
                stroke={medialuna} strokeWidth="3" strokeLinejoin="round" />
          <path d="M37 109 Q40 115 37 121 M46 107 V120 M55 109 Q52 115 55 121" stroke={medialunaSombra} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <Destello cx={118} cy={56} s={5.5} fill={paleta.acento} />
        </>
      )
      break
    }
    case 'no-regalar': {
      const taza = BLANCO, tazaSombra = BLANCO_SOMBRA
      const una = (y: number, giro: number) => (
        <g transform={`rotate(${giro} 76 ${y + 14})`}>
          <path d={`M90 ${y + 7} C102 ${y + 7} 102 ${y + 22} 89 ${y + 22}`} fill="none" stroke={tazaSombra} strokeWidth="5" strokeLinecap="round" />
          {conSombra(`M58 ${y} H94 V${y + 22} Q94 ${y + 28} 88 ${y + 28} H64 Q58 ${y + 28} 58 ${y + 22} Z`, taza, tazaSombra, 76)}
        </g>
      )
      dibujo = (
        <>
          <defs>{mitad(76)}</defs>
          {escenario}
          {/* mil tazas… */}
          {una(104, 0)}{una(74, -5)}{una(44, 4)}
          {/* …y el sello: otra, no */}
          <circle cx="114" cy="50" r="19" fill={paleta.acento} />
          <circle cx="114" cy="50" r="11" fill="none" stroke={TINTA} strokeWidth="4" />
          <path d="M106 42 L122 58" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
          <Destello cx={40} cy={58} s={5} fill={paleta.acento} />
        </>
      )
      break
    }
  }
  return <svg aria-hidden viewBox="0 0 160 160" width={size} height={size} className={className}>{dibujo}</svg>
}
