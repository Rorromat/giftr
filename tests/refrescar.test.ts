import { describe, expect, it } from 'vitest'
import { refrescaEn } from '@/components/Refrescar'

// Tirar para actualizar: solo donde lo que se ve lo pueden cambiar otros; nunca en un formulario.
describe('refrescaEn', () => {
  it('en las secciones, un grupo, un deseo y la lista compartida', () => {
    for (const p of ['/inicio', '/novedades', '/gente', '/cuentas', '/regalos', '/mi-lista', '/eventos', '/deseo/abc', '/grupos/abc',
      '/l/tok', '/l/tok/item/abc', '/l/tok/perfil']) expect(refrescaEn(p), p).toBe(true)
  })
  it('no en los formularios ni en la portada', () => {
    for (const p of ['/', '/agregar', '/editar/abc', '/perfil', '/grupos/nuevo', '/grupos/unirme/tok', '/bienvenida',
      '/bienvenida/listo', '/grupos', '/deseo', '/l']) expect(refrescaEn(p), p).toBe(false)
  })
})
