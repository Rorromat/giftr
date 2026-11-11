import { beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { items, users } from '@/db/schema'
import { createItem } from '@/lib/items'
import { reserveItem } from '@/lib/claims'
import { iniciarRegaloGrupal } from '@/lib/regalos'
import { asegurarListaPropia } from '@/lib/users'

// Descargar los datos, borrar la cuenta y la página de privacidad tal cual se ven, con la base en PGlite y la sesión y las
// redirecciones de Next simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string; user?: { name: string; email?: string } } | null,
  signOut: [] as unknown[],
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: async (o: unknown) => { h.signOut.push(o) } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

import { borrarCuentaAction } from '@/app/actions'
import { GET as descargar } from '@/app/api/perfil/datos/route'
import Home from '@/app/page'
import Privacidad from '@/app/privacidad/page'
import Perfil from '@/app/(menu)/perfil/page'
import BorrarCuenta from '@/app/(menu)/perfil/borrar/page'

const html = async (p: Promise<React.ReactNode> | React.ReactNode) => renderToStaticMarkup(await p as React.ReactElement)
const texto = (marcado: string) => marcado.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ')
function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}
async function redirige(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    if ((e as Error).message !== 'NEXT_REDIRECT') throw e
    return (e as { url: string }).url
  }
}

beforeEach(async () => {
  h.db = await createTestDb()
  h.session = null
  h.signOut = []
})

test('descargar mis datos: solo con sesión, baja como archivo y trae lo de quien lo pide', async () => {
  const { owner, giver } = await seedOwnerAndGiver(h.db)
  await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Termo' })
  expect((await descargar()).status).toBe(401)

  h.session = { userId: owner.id }
  const r = await descargar()
  expect(r.status).toBe(200)
  expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="giftr-mis-datos-\d{4}-\d{2}-\d{2}\.json"$/)
  expect(r.headers.get('content-type')).toContain('application/json')
  expect(r.headers.get('cache-control')).toContain('no-store')
  const cuerpo = await r.text()
  // se lee: con saltos de línea, no en un solo renglón
  expect(cuerpo.split('\n').length).toBeGreaterThan(20)
  const datos = JSON.parse(cuerpo)
  expect(datos.perfil).toMatchObject({ nombre: 'Euge', mail: 'euge@test.com' })
  expect(datos.tuLista.deseos.map((d: { titulo: string }) => d.titulo)).toEqual(['Termo'])
  expect(cuerpo).not.toContain('rodri@test.com')

  // el otro baja lo suyo, no lo de ella
  h.session = { userId: giver.id }
  const suyo = await (await descargar()).text()
  expect(suyo).toContain('rodri@test.com')
  expect(suyo).not.toContain('Termo')
  // la sesión de una cuenta que ya no existe no baja nada
  h.session = { userId: '00000000-0000-4000-8000-000000000000' }
  expect((await descargar()).status).toBe(401)
})

test('borrar mi cuenta pide escribir BORRAR; con la palabra, borra, cierra la sesión y deja en la portada con el mensaje', async () => {
  const { owner } = await seedOwnerAndGiver(h.db)
  expect(await redirige(borrarCuentaAction(form({ confirmar: 'BORRAR' })))).toBe('/')

  h.session = { userId: owner.id }
  for (const mal of [{}, { confirmar: 'si' }, { confirmar: 'BORRAR TODO' }]) {
    expect(await redirige(borrarCuentaAction(form(mal as Record<string, string>)))).toBe('/perfil/borrar?aviso=palabra#confirmar')
  }
  expect(await h.db.select().from(users).where(eq(users.id, owner.id))).toHaveLength(1)
  expect(h.signOut).toEqual([])

  // en minúsculas también vale (el teclado del teléfono)
  expect(await redirige(borrarCuentaAction(form({ confirmar: ' borrar ' })))).toBeNull()
  expect(await h.db.select().from(users).where(eq(users.id, owner.id))).toEqual([])
  expect(h.signOut).toEqual([{ redirectTo: '/?cuenta=borrada' }])

  // el mensaje de la portada, solo ahí y ya sin sesión
  h.session = null
  expect(texto(await html(Home({ searchParams: Promise.resolve({ cuenta: 'borrada' }) })))).toContain('Listo: borramos tu cuenta y todo lo tuyo.')
  expect(texto(await html(Home({ searchParams: Promise.resolve({}) })))).not.toContain('borramos tu cuenta')
})

test('Perfil: quién ve tu perfil y cómo cortarlo, descargar tus datos, la página de privacidad y, al final, borrar la cuenta', async () => {
  const { owner } = await seedOwnerAndGiver(h.db)
  h.session = { userId: owner.id, user: { name: 'Euge', email: 'euge@test.com' } }
  const perfil = await html(Perfil({ searchParams: Promise.resolve({}) }))
  expect(texto(perfil)).toContain('Tu perfil (foto, cumple, gustos y talles) lo ve cualquiera que tenga el link de tu lista, sea o no tu amigo.')
  expect(texto(perfil)).toContain('dejaste de ser amigo de alguien que ya lo tenía, cambiá el link : el de antes deja de andar.')
  // el link lleva a donde se cambia
  expect(perfil).toContain('href="#link"')
  expect(perfil.indexOf('id="link"')).toBeLessThan(perfil.indexOf('Cambiar el link para regalar'))
  expect(perfil).toMatch(/<a href="\/api\/perfil\/datos" download=""[^>]*>[\s\S]*Descargar mis datos/)
  expect(perfil).toContain('href="/privacidad"')
  // borrar va al final de todo, después de "Cerrar sesión", y lleva a su propio paso: desde Perfil no se borra nada
  expect(perfil).toContain('href="/perfil/borrar"')
  expect(perfil.indexOf('Cerrar sesión')).toBeLessThan(perfil.indexOf('Borrar mi cuenta'))
  expect(perfil.slice(perfil.indexOf('id="borrar"'))).not.toContain('<form')
})

test('el paso de borrar dice qué pasa con lo de esta persona, y lo mismo le hayan reservado algo o no', async () => {
  const { owner, giver } = await seedOwnerAndGiver(h.db)
  expect(await redirige(BorrarCuenta({ searchParams: Promise.resolve({}) }))).toBe('/')
  h.session = { userId: owner.id }
  const termo = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  const paso = async (sp: Record<string, string> = {}) => texto(await html(BorrarCuenta({ searchParams: Promise.resolve(sp) })))

  const sinNada = await paso()
  expect(sinNada).toContain('Esto no se puede deshacer.')
  expect(sinNada).toContain('Tu lista y todos tus deseos, con sus fotos.')
  expect(sinNada).toContain('se libera, así lo puede regalar otra persona')
  expect(sinNada).toContain('sigue figurando comprado, para que nadie lo compre de nuevo. En vez de tu nombre dice “Cuenta eliminada”.')
  expect(sinNada).toContain('Para confirmar, escribí BORRAR')
  expect(sinNada).toContain('Borrar mi cuenta para siempre')
  expect(sinNada).not.toContain('regalo grupal que organizás')
  expect(sinNada).not.toContain('Tus cuentas de regalos grupales')

  // que alguien le reserve algo no cambia ni una letra de lo que ve (la sorpresa)
  expect((await reserveItem(h.db, termo.id, { userId: giver.id })).ok).toBe(true)
  expect(await paso()).toBe(sinNada)

  // lo que organiza él en la lista de otro, sí se lo decimos
  await asegurarListaPropia(h.db, giver.id)
  const deRodri = (await createItem(h.db, giver.id, { tipo: 'exacto', titulo: 'Bici' }))!
  expect((await iniciarRegaloGrupal(h.db, deRodri.id, owner.id)).ok).toBe(true)
  expect(await paso()).toContain('El regalo grupal que organizás y todavía no compraste: se cancela, y a los que se sumaron les llega el aviso.')

  expect(await paso({ aviso: 'palabra' })).toContain('No se borró nada: escribí la palabra BORRAR para confirmar.')
  expect(await paso({ aviso: 'error' })).toContain('No pudimos borrar tu cuenta y no se borró nada.')
  const marcado = await html(BorrarCuenta({ searchParams: Promise.resolve({}) }))
  expect(marcado).toMatch(/<input[^>]*required=""[^>]*name="confirmar"/)
  // desde acá no se borró nada
  expect(await h.db.select().from(items)).toHaveLength(2)
})

test('la página de privacidad es pública, dice quién ve qué y cómo llevarse o borrar lo propio, y está enlazada desde la portada', async () => {
  const pagina = await html(Privacidad())
  const t = texto(pagina)
  for (const frase of [
    'quien arma una lista nunca ve quién le reservó o le compró algo',
    'Quien tiene el link de tu lista ve tus deseos y tu perfil',
    'Tu alias o CVU lo ve solo quien te debe su parte de un regalo grupal.',
    'dejás solo un nombre',
    'La de sesión:', 'La de invitado:', 'La de cuentas del navegador:',
    'Google, para entrar', 'Vercel y Neon', 'El servicio de avisos de tu navegador', 'Solo se pide la página; no se manda nada tuyo.',
    'Cambiar el link de tu lista:', 'Descargar tus datos:', 'Borrar tu cuenta:',
  ]) expect(t, frase).toContain(frase)
  // sin un contacto ni una razón social inventados, ni promesas de cumplir una ley (lo completa el dueño del producto)
  expect(pagina).not.toMatch(/mailto:|@giftr|S\.A\.|S\.R\.L\.|\bley\b|GDPR|RGPD/i)
  expect(pagina).toContain('href="/perfil#link"')

  const portada = await html(Home({ searchParams: Promise.resolve({}) }))
  expect(portada).toMatch(/<footer[^>]*><a[^>]*href="\/privacidad"[^>]*>Privacidad<\/a><\/footer>/)
})
