/** Para comparar al buscar: en minúsculas y sin tildes ("Pérez" encuentra "perez", "@SOFI" encuentra "sofi"). */
export const paraBuscar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Si el texto de algo (ya con paraBuscar) tiene todas las palabras de lo buscado, en cualquier orden. */
export const coincide = (texto: string, buscado: string) => paraBuscar(buscado).split(' ').every((p) => !p || texto.includes(p.replace(/^@/, '')))

/** Desde cuántos deseos una lista tiene buscador (con menos se ven todos de un vistazo). */
export const BUSCAR_DESDE = 6
