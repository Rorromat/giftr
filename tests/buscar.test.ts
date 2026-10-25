import { expect, test } from 'vitest'
import { coincide, paraBuscar } from '@/lib/buscar'

test('buscar: sin tildes ni mayúsculas, todas las palabras en cualquier orden, con o sin @', () => {
  const sofi = paraBuscar('Sofía Pérez sofi.perez')
  expect(sofi).toBe('sofia perez sofi.perez')
  for (const q of ['sofi', 'SOFÍA', 'perez sof', '@sofi.perez', '  pérez  ', '']) expect(coincide(sofi, q), q).toBe(true)
  for (const q of ['rodri', 'sofia rodri', '@juan']) expect(coincide(sofi, q), q).toBe(false)
})
