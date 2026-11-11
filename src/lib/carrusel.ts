// Corre en el navegador: el carrusel de Inicio cuando pasa solo (ver CarruselNovedades).

/** Lo que se mira del carrusel y de sus tarjetas para saber adónde va (las medidas de un elemento con scroll de costado). */
type Carrusel = { scrollLeft: number; clientWidth: number; scrollWidth: number; children: ArrayLike<unknown> }

/**
 * Adónde va el carrusel cuando pasa solo: a la tarjeta que sigue a la que está en el medio, centrada; después de la
 * última (o si ya no se puede deslizar más), a la primera, y ahí avisa que dio la vuelta: con eso deja de pasar solo.
 */
export function siguienteDelCarrusel(el: Carrusel) {
  const tarjetas = Array.from(el.children) as { offsetLeft: number; offsetWidth: number }[]
  const centro = el.scrollLeft + el.clientWidth / 2
  const ahora = tarjetas.findIndex((c) => c.offsetLeft + c.offsetWidth > centro)
  const alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
  const volvio = alFinal || ahora < 0 || ahora + 1 >= tarjetas.length
  const sig = tarjetas[volvio ? 0 : ahora + 1]
  return { izquierda: sig.offsetLeft - (el.clientWidth - sig.offsetWidth) / 2, volvio }
}
