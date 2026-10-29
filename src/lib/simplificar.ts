// Simplificar las deudas, a lo Splitwise: si Ana le debe a Bruno y Bruno le debe a Carla, Ana le paga directo a Carla y
// Bruno no paga ni cobra. Si se deben en ronda (Ana a Bruno, Bruno a Carla y Carla a Ana), se cancela sin que nadie pague.
// Es solo un plan: lo que se debe sigue siendo una parte de un regalo con su encargado (ver regalos.ts), y pagar un tramo
// salda un poco de cada deuda del camino.
// Dos reglas, para que no se pague entre desconocidos ni se arruine una sorpresa:
// - Los de un tramo se conocen todos entre sí: son amigos, o ya armaron un regalo juntos.
// - Ninguno de un tramo recibe uno de los regalos de ese tramo: si la deuda de Carla con Bruno es por el regalo de Ana,
//   Ana no puede terminar pagándole a Bruno (sospecharía), ni enterarse de que alguien le paga a Bruno por Carla.
// Sin dependencias: es aritmética sobre ids, así se prueba sola.

/** Lo que uno le debe a otro (el neto entre los dos, en una moneda) y de qué regalos sale. */
export type Deuda = { de: string; a: string; monto: number; regalos: string[] }

/**
 * Un pago del plan: camino[0] le paga monto a camino.at(-1), y con eso queda saldado ese monto de cada deuda del camino
 * (camino[i] le debía a camino[i + 1]). De dos, es la deuda misma; de más, se saltean los del medio. Si empieza y termina en
 * el mismo, es una ronda: se cancela sin que nadie pague.
 */
export type Tramo = { monto: number; camino: string[] }

export type Reglas = {
  /** Se conocen: son amigos o armaron un regalo juntos. */
  conocen: (a: string, b: string) => boolean
  /** Para quiénes es un regalo: los dueños de su lista (también los que salieron) y el de una sorpresa. */
  receptores: (giftId: string) => Iterable<string>
}

/** Lo que uno le debe a otro mientras se simplifica: los tramos que lo forman, quiénes están en ellos y para quiénes son. */
type Arista = { de: string; a: string; tramos: Tramo[]; gente: Set<string>; receptores: Set<string> }

/** Cuántas veces se combinan dos deudas como mucho (cada vez baja el total que se mueve: termina sola, esto es por las dudas). */
const PASOS_MAXIMOS = 500

const clave = (de: string, a: string) => `${de}>${a}`
const totalDe = (tramos: Tramo[]) => tramos.reduce((s, t) => s + t.monto, 0)
const unir = <T>(...conjuntos: Set<T>[]) => new Set(conjuntos.flatMap((c) => [...c]))

/** Saca monto de los primeros tramos (los cambia) y devuelve los pedazos que sacó, en orden. */
function sacar(tramos: Tramo[], monto: number): Tramo[] {
  const pedazos: Tramo[] = []
  for (let falta = monto; falta > 0;) {
    const t = tramos[0]
    const m = Math.min(t.monto, falta)
    pedazos.push({ monto: m, camino: t.camino })
    t.monto -= m
    falta -= m
    if (!t.monto) tramos.shift()
  }
  return pedazos
}

/** Pega dos tandas de pedazos que suman lo mismo: cada pedazo de la primera sigue por la segunda (u…v y v…w dan u…v…w). */
function pegar(a: Tramo[], b: Tramo[]): Tramo[] {
  const pegados: Tramo[] = []
  let i = 0
  let j = 0
  let ra = a[0]?.monto ?? 0
  let rb = b[0]?.monto ?? 0
  while (i < a.length && j < b.length) {
    const m = Math.min(ra, rb)
    pegados.push({ monto: m, camino: [...a[i].camino, ...b[j].camino.slice(1)] })
    ra -= m
    rb -= m
    if (!ra && ++i < a.length) ra = a[i].monto
    if (!rb && ++j < b.length) rb = b[j].monto
  }
  return pegados
}

/** Los mismos caminos, juntos y en orden (por camino): así el plan sale igual para todos los que lo miran. */
function juntar(tramos: Tramo[]): Tramo[] {
  const porCamino = new Map<string, Tramo>()
  for (const t of tramos) {
    const k = t.camino.join('>')
    const ya = porCamino.get(k)
    if (ya) ya.monto += t.monto
    else porCamino.set(k, { monto: t.monto, camino: [...t.camino] })
  }
  return [...porCamino.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, t]) => t)
}

/**
 * El plan para quedar a mano con menos pagos: las deudas que se pueden combinar (ver las reglas arriba) se combinan, y lo
 * demás queda como estaba. Devuelve todos los tramos: los directos (la deuda de siempre, de dos), los que saltean a alguien y
 * las rondas. Mismas deudas, mismo plan: no depende de quién lo pide.
 */
export function simplificar(deudas: Deuda[], reglas: Reglas): Tramo[] {
  const aristas = new Map<string, Arista>()
  for (const d of [...deudas].sort((x, y) => (clave(x.de, x.a) < clave(y.de, y.a) ? -1 : 1))) {
    if (d.monto <= 0 || d.de === d.a) continue
    aristas.set(clave(d.de, d.a), {
      de: d.de, a: d.a, tramos: [{ monto: d.monto, camino: [d.de, d.a] }], gente: new Set([d.de, d.a]),
      receptores: new Set(d.regalos.flatMap((g) => [...reglas.receptores(g)])),
    })
  }
  const rondas: Tramo[] = []

  /** Que se conozcan todos y que ninguno reciba uno de esos regalos. */
  function sePuede(...juntas: Arista[]) {
    const gente = [...unir(...juntas.map((x) => x.gente))]
    const receptores = unir(...juntas.map((x) => x.receptores))
    if (gente.some((p) => receptores.has(p))) return false
    return gente.every((p, i) => gente.slice(i + 1).every((q) => reglas.conocen(p, q)))
  }

  /**
   * La próxima combinación: x (u→v) e y (v→w) pasan a ser u→w. Primero las que no suman a nadie nuevo con quien pagar (ya
   * hay algo entre u y w: se suma o se cancela en ronda), después las demás. Los caminos no se cruzan: solo comparten a v
   * (y, en una ronda, a u y w).
   */
  function siguiente(): { x: Arista; y: Arista } | null {
    const ordenadas = [...aristas.values()].sort((p, q) => (clave(p.de, p.a) < clave(q.de, q.a) ? -1 : 1))
    for (const conAlgoYa of [true, false]) {
      for (const x of ordenadas) {
        for (const y of ordenadas) {
          if (y.de !== x.a || y.a === x.de) continue
          const ida = aristas.get(clave(x.de, y.a))
          const vuelta = aristas.get(clave(y.a, x.de))
          if (conAlgoYa !== !!(ida || vuelta)) continue
          if ([...x.gente].some((p) => p !== x.a && y.gente.has(p))) continue
          if (vuelta && [...vuelta.gente].some((p) => p !== x.de && p !== y.a && (x.gente.has(p) || y.gente.has(p)))) continue
          if (sePuede(x, y, ...(vuelta ? [vuelta] : []))) return { x, y }
        }
      }
    }
    return null
  }

  for (let paso = 0; paso < PASOS_MAXIMOS; paso++) {
    const par = siguiente()
    if (!par) break
    const { x, y } = par
    const u = x.de
    const w = y.a
    const m = Math.min(totalDe(x.tramos), totalDe(y.tramos))
    const nuevos = pegar(sacar(x.tramos, m), sacar(y.tramos, m))
    for (const z of [x, y]) if (!z.tramos.length) aristas.delete(clave(z.de, z.a))
    const gente = unir(x.gente, y.gente)
    const receptores = unir(x.receptores, y.receptores)

    // si w ya le debía a u, lo que ahora u le paga a w se cancela con eso: una ronda
    const vuelta = aristas.get(clave(w, u))
    if (vuelta) {
      const k = Math.min(totalDe(vuelta.tramos), m)
      rondas.push(...pegar(sacar(nuevos, k), sacar(vuelta.tramos, k)))
      if (!vuelta.tramos.length) aristas.delete(clave(w, u))
    }
    if (!nuevos.length) continue
    const ida = aristas.get(clave(u, w))
    if (ida) {
      ida.tramos.push(...nuevos)
      ida.gente = unir(ida.gente, gente)
      ida.receptores = unir(ida.receptores, receptores)
    } else {
      aristas.set(clave(u, w), { de: u, a: w, tramos: nuevos, gente, receptores })
    }
  }
  return juntar([...[...aristas.values()].flatMap((x) => x.tramos), ...rondas])
}
