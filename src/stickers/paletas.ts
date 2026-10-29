import type { Palette } from './fun'
import type { Tema } from '@/lib/tema'

// Cómo pinta cada propuesta de diseño los stickers (ver lib/tema.ts y temas.css). Los lugares de la paleta son roles, así
// cada parte conserva su sentido: main para los cuerpos, deep el segundo color oscuro, gold monedas, estrellas y moños, tint
// lo pálido, ok lo que salió bien, hot corazones y llamas; ink es el borde.

export const PALETAS: Record<Tema, Palette> = {
  // lino, petróleo, rosa viejo y ocre: el borde va en petróleo, no en negro
  sobremesa: { main: '#C55E66', deep: '#0C3D4F', gold: '#DB9957', tint: '#F4DCD3', ok: '#3E7C86', hot: '#A9434D', white: '#FFFBF5', paper: '#F6EFE6', grey: '#C9C0B4', ink: '#0A2B38' },
  // papel, oliva, café y topo: tinta de café
  revista: { main: '#B7B86D', deep: '#65554F', gold: '#D1B866', tint: '#EFEADB', ok: '#7F8040', hot: '#A65D45', white: '#FBF9F3', paper: '#F1EDE3', grey: '#C4BBAE', ink: '#29201E' },
  // grafito y brasa: sobre lo oscuro, lo claro y el naranja
  brasa: { main: '#FB3C20', deep: '#4A4A52', gold: '#FFB078', tint: '#FFE0D6', ok: '#FF8457', hot: '#C22A12', white: '#F7F2EE', paper: '#E8E1DC', grey: '#9C9591', ink: '#0D0D0F' },
  // cielo, carbón, rojo y pizarra
  cielo: { main: '#EB253B', deep: '#44636D', gold: '#6FA8D6', tint: '#D3E7F6', ok: '#6E929C', hot: '#B81B2D', white: '#FFFFFF', paper: '#F2F8FC', grey: '#B4C3CC', ink: '#332C2D' },
}
