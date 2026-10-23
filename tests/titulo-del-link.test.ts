import { expect, test } from 'vitest'
import { tituloDelLink } from '@/lib/links'
import { mlUrls } from './fixtures/links/leer'

// El nombre que trae el link mismo: es lo que queda de título cuando la página no se puede leer (o antes de leerla).

test('las formas de cada tienda', () => {
  for (const [link, titulo] of [
    // MercadoLibre: publicación, catálogo y user product
    ['https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-de-algarrobo-premium-artesanal-con-bombilla-_JM', 'Mate de algarrobo premium artesanal con bombilla'],
    ['https://www.mercadolibre.com.ar/termo-original-stanley-mate-system-12-litros-rosa/p/MLA39939183', 'Termo original stanley mate system 12 litros rosa'],
    ['https://www.mercadolibre.com.ar/canasta-matera-eco-cuero/up/MLAU3409701436?pdp_filters=item_id%3AMLA2324526514', 'Canasta matera eco cuero'],
    // Shopify, Tiendanube, WooCommerce, Megatone (corta en _), VTEX, Frávega, Nike, Etsy, Amazon, Shein, Temu
    ['https://www.crocs.com.ar/products/crocs-classic-vegan-suede-moc-c212097-c2jj', 'Crocs classic vegan suede moc c2jj'],
    ['https://www.companiadesombreros.com.ar/productos/bandolera-macrame/', 'Bandolera macrame'],
    ['https://cuspide.com/producto/antes-de-que-se-enfrie-el-cafe/', 'Antes de que se enfrie el cafe'],
    ['https://www.megatone.net/producto/aire-acondicionado-split-friocalor-bgh-4644f-bs54wcdw_MKT0278BGH/', 'Aire acondicionado split friocalor bgh'],
    ['https://www.jumbo.com.ar/cerveza-quilmes-clasica-lata-473mlx6/p', 'Cerveza quilmes clasica lata'],
    ['https://www.fravega.com/p/bateria-tramontina-allegra-7pz-661608/', 'Bateria tramontina allegra 7pz'],
    ['https://www.nike.com/t/air-force-1-07-mens-shoes-jBrhbr/CW2288-111', 'Air force 1 07 mens shoes jBrhbr'],
    ['https://www.etsy.com/listing/1628224217/animals-puzzle-with-custom-baby-name', 'Animals puzzle with custom baby name'],
    ['https://www.amazon.com/Echo-Dot-5th-Gen-2022/dp/B09B8V1LZ3', 'Echo Dot 5th Gen'],
    ['https://us.shein.com/DAZY-Women-s-White-Long-Sleeve-Square-Neck-Blouse-p-77671994.html', 'DAZY Women s White Long Sleeve Square Neck Blouse'],
    ['https://www.temu.com/1pc-yerba-mate-gourd-with-bombilla-g-601099538564934.html', '1pc yerba mate gourd with bombilla'],
    // si no coincide ninguna: el último pedazo del path sin la extensión, o el de antes si ese es el código del producto
    ['https://www.ikea.com/us/en/p/billy-bookcase-white-00263850/', 'Billy bookcase white'],
    ['https://www.booking.com/hotel/ar/alvear-palace.html', 'Alvear palace'],
    ['https://www.dexter.com.ar/pantalon-nike-sportswear-club-mujer/NIIM8409-010.html', 'Pantalon nike sportswear club mujer'],
    ['https://ar.puma.com/pd/chatitas-speedcat-gamuza-para-mujer/401287.html?color=02', 'Chatitas speedcat gamuza para mujer'],
    ['https://www.tienda.com.ar/mate-imperial-de-calabaza/SKU12345', 'Mate imperial de calabaza'],
    ['https://www.cotodigital.com.ar/sitios/cdigi/productos/bourbon-finish-7-a%C3%B1os-ballantines-bot-700-ml/_/R-00528755-00528755-200', 'Bourbon finish 7 años ballantines bot 700 ml'],
    ['http://tienda.com.ar/productos/mate-de-calabaza', 'Mate de calabaza'],
  ] as const) expect(tituloDelLink(link), link).toBe(titulo)
})

test('los casos de links de MercadoLibre', () => {
  const titulos = mlUrls().casos.map((c) => tituloDelLink(c.url))
  expect(titulos).toEqual([
    'Mate de algarrobo premium artesanal con bombilla',
    'Mate de algarrobo premium artesanal con bombilla', // tracking y #fragmento
    'Mate de algarrobo premium artesanal con bombilla', // afiliados
    'Termo original stanley mate system 12 litros rosa',
    'Canasta matera eco cuero portatermo practica y resistente',
    'Departamento en venta en miami florida estados unidos',
    'Toyota hilux pick up 24 cd dx 150cv 4x4 at de',
    'Caja rodante de almacenaje profesional stanley color negro', // sin el 033026r
    'Garrafa termica stanley aerolight transit 354ml dried pine lisa', // sin el 8605
    'Copo termico quencher 887ml stanley',
    null, // meli.la: el nombre está del otro lado de la redirección
    null, // mercadolibre.com/sec/
    null, // un clip: en ML solo sus formas de publicación
    null, // el muro: el nombre sale de go= (ver pagina-de-afuera)
    null, // meli://: no es un link de una página
  ])
  // los que traen el nombre lo dan igual que slugTitle
  for (const c of mlUrls().casos.filter((c) => c.slugTitle)) {
    expect(tituloDelLink(c.url)?.toLowerCase(), c.url).toBe(c.slugTitle)
  }
})

test('sin nombre: null', () => {
  for (const link of [
    'https://meli.la/x', 'https://www.mercadolibre.com.ar/', 'https://www.crocs.com.ar/', 'https://www.crocs.com.ar',
    'https://x.com/item/1234567', 'https://www.zara.com/ar/campera', 'https://www.airbnb.com/rooms/5931067',
    'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.amazon.com/dp/B09B8V1LZ3', 'https://auto.mercadolibre.com.ar/MLA-2324526514-_JM', 'https://amzn.to/4sbF6z81',
    'javascript:alert(1)', 'no es un link', '',
    // más de la mitad descartada: no es el nombre
    'https://x.com/productos/ab12cd34-ef56gh78-mate',
    // el de antes de un número suelto o de una palabra es la categoría, no el producto
    'https://www.tienda.com.ar/electrodomesticos-cocina/123456', 'https://www.tienda.com/zapatillas-running/ofertas',
  ]) expect(tituloDelLink(link), link).toBeNull()
})

test('lo que sigue al -_JM no cambia nada, y un % suelto no rompe', () => {
  expect(tituloDelLink('https://articulo.mercadolibre.com.ar/MLA-123456-mate-imperial-_JM-xxxx-yyyy#position=3')).toBe('Mate imperial')
  expect(tituloDelLink('https://www.tienda.com/products/mate-100%-algarrobo')).toBe('Mate 100% algarrobo')
})

test('no tarda aunque el path sea enorme', () => {
  const links = [
    `https://articulo.mercadolibre.com.ar/${'MLA-1-'.repeat(330)}`, `https://x.com/${'a-p-1'.repeat(400)}`,
    `https://x.com/${'a/'.repeat(1000)}`, `https://x.com/${'-'.repeat(1990)}`, `https://x.com/${'ab-'.repeat(660)}`,
  ]
  for (const link of links) {
    const antes = performance.now()
    tituloDelLink(link)
    expect(performance.now() - antes, link.slice(0, 40)).toBeLessThan(50)
  }
})
