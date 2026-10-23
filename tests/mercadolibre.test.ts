import { expect, test } from 'vitest'
import { esPublicacionDeMarketplace, linkDeMercadoLibre, ML_PEDIR_MARKETPLACE } from '@/lib/mercadolibre'
import { mlUrls } from './fixtures/links/leer'

// Los links de MercadoLibre: qué son y qué ids traen, sin pedir nada.

test('los casos de links de MercadoLibre', () => {
  const r = mlUrls().casos.map((c) => linkDeMercadoLibre(c.url))
  const mate = { sitio: 'MLA', tipo: 'item', marketplace: true, itemId: 'MLA1418506688', slug: 'mate-de-algarrobo-premium-artesanal-con-bombilla' }
  expect(r).toEqual([
    mate,
    mate, // el #fragmento y la query de tracking no cambian nada
    mate, // ni los parámetros de afiliados
    { sitio: 'MLA', tipo: 'catalogo', marketplace: true, productId: 'MLA39939183', slug: 'termo-original-stanley-mate-system-12-litros-rosa' },
    {
      sitio: 'MLA', tipo: 'up', marketplace: true, upId: 'MLAU3409701436', itemId: 'MLA2324526514',
      slug: 'canasta-matera-eco-cuero-portatermo-practica-y-resistente',
    },
    // los clasificados no son de marketplace: no tienen muro
    { sitio: 'MLA', tipo: 'clasificado', marketplace: false, itemId: 'MLA2042172639', slug: 'departamento-en-venta-en-miami-florida-estados-unidos' },
    { sitio: 'MLA', tipo: 'clasificado', marketplace: false, itemId: 'MLA1579719973', slug: 'toyota-hilux-pick-up-24-cd-dx-150cv-4x4-at-de' },
    { sitio: 'MLM', tipo: 'catalogo', marketplace: true, productId: 'MLM21025398', slug: 'caja-rodante-de-almacenaje-profesional-stanley-033026r-color-negro' },
    { sitio: 'MLB', tipo: 'catalogo', marketplace: true, productId: 'MLB79300621', slug: 'garrafa-termica-stanley-aerolight-transit-354ml-8605-dried-pine-lisa' },
    { sitio: 'MLB', tipo: 'up', marketplace: true, upId: 'MLBU3435888552', itemId: 'MLB5034472453', slug: 'copo-termico-quencher-887ml-stanley' },
    { sitio: '', tipo: 'corto', marketplace: false },
    { sitio: '', tipo: 'corto', marketplace: false },
    { sitio: 'MLA', tipo: 'otro', marketplace: true }, // un clip
    mate, // el muro: la publicación que se quería ver, de go=
    null, // meli:// no es un link de una página
  ])
  // y coinciden con lo que dice cada caso (salvo el deeplink de la app, que no es un link de una página)
  for (const [i, c] of mlUrls().casos.entries()) {
    if (c.tipo === 'deeplink_app') continue
    if (c.itemId) expect(r[i]?.itemId, c.url).toBe(c.itemId)
    if (c.catalogProductId) expect(r[i]?.productId, c.url).toBe(c.catalogProductId)
    if (c.userProductId) expect(r[i]?.upId, c.url).toBe(c.userProductId)
    if (c.siteId) expect(r[i]?.sitio, c.url).toBe(c.siteId)
  }
})

test('el item de un /up/ también puede venir en wid= del fragmento', () => {
  expect(linkDeMercadoLibre('https://www.mercadolibre.com.ar/x-y/up/MLAU3409701436#polycard_client=a&wid=MLA2324526514'))
    .toMatchObject({ tipo: 'up', itemId: 'MLA2324526514' })
  // un id que no tiene la forma no se toma: nunca se arma una URL con texto del link sin validar
  expect(linkDeMercadoLibre('https://www.mercadolibre.com.ar/x-y/up/MLAU3409701436?pdp_filters=item_id%3AMLA12%2F..%2Fx'))
    .not.toHaveProperty('itemId')
})

test('un catálogo o un /up/ sin el nombre antes sigue siendo eso (no un item: la API sería otra)', () => {
  expect(linkDeMercadoLibre('https://www.mercadolibre.com.ar/p/MLA39939183'))
    .toStrictEqual({ sitio: 'MLA', tipo: 'catalogo', marketplace: true, productId: 'MLA39939183' })
  expect(linkDeMercadoLibre('https://www.mercadolibre.com.ar/up/MLAU3409701436?pdp_filters=item_id%3AMLA2324526514'))
    .toStrictEqual({ sitio: 'MLA', tipo: 'up', marketplace: true, upId: 'MLAU3409701436', itemId: 'MLA2324526514' })
  expect(esPublicacionDeMarketplace(linkDeMercadoLibre('https://www.mercadolibre.com.ar/up/MLAU3409701436'))).toBe(true)
})

test('lo que no es de MercadoLibre da null, aunque se parezca', () => {
  for (const url of [
    'https://mercadolibre.com.ar.evil.com/MLA-1418506688-mate-_JM', 'https://evilmercadolibre.com.ar/MLA-1418506688-mate-_JM',
    'https://www.mercadolibre.com.ar@evil.com/MLA-1', 'https://meli.la.evil.com/x', 'https://www.crocs.com.ar/products/x',
    'ftp://articulo.mercadolibre.com.ar/MLA-1418506688-_JM', 'no es un link',
  ]) expect(linkDeMercadoLibre(url), url).toBeNull()
  // con el punto final o en mayúsculas es el mismo host
  expect(linkDeMercadoLibre('https://ARTICULO.MercadoLibre.com.ar./MLA-1418506688-mate-_JM')).toMatchObject({ tipo: 'item', itemId: 'MLA1418506688' })
})

test('las publicaciones con muro son las de marketplace: no los clasificados, las tiendas ni los clips', () => {
  const muro = (url: string) => esPublicacionDeMarketplace(linkDeMercadoLibre(url))
  expect(muro('https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-_JM')).toBe(true)
  expect(muro('https://www.mercadolibre.com.ar/termo/p/MLA39939183')).toBe(true)
  expect(muro('https://www.mercadolibre.com.ar/canasta/up/MLAU3409701436')).toBe(true)
  expect(muro('https://produto.mercadolivre.com.br/MLB-5034472453-copo-_JM')).toBe(true)
  for (const no of [
    'https://auto.mercadolibre.com.ar/MLA-1579719973-toyota-_JM', 'https://departamento.mercadolibre.com.ar/MLA-2042172639-depto-_JM',
    'https://www.mercadolibre.com.ar/tienda/laska', 'https://www.mercadolibre.com.ar/shorts/clips/QdsnCh/termo', 'https://meli.la/2abcXYZ',
    'https://www.crocs.com.ar/products/x',
  ]) expect(muro(no), no).toBe(false)
})

test('las publicaciones de marketplace se piden (para saber, por los logs, cuánto bloquea el muro)', () => {
  expect(ML_PEDIR_MARKETPLACE).toBe(true)
})
