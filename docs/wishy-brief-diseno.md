# GiftR — Brief de diseño

Describe lo que el código hace hoy (el archivo conserva el nombre de cuando la app se llamaba Wishy). La fuente de verdad
es `src/app/tokens.css` (los tokens y las clases `gr-*`) y `src/components/ui.tsx` (las piezas base): si este brief y el
código no coinciden, vale el código.

## 1. Qué es GiftR

App de listas de deseos con una regla sagrada: **todos ven todo, menos lo tuyo**. El dueño arma su lista y la comparte
por WhatsApp; su gente reserva regalos y coordina en secreto sin duplicarse. El dueño jamás ve qué le van a regalar.
Sensación buscada: para quien regala, **alivio** ("ya está, no me duplico"); para el dueño, **ilusión** sin ansiedad. Es
una app de afecto, no de e-commerce. PWA mobile-first (base 375 px, contenedor `max-w-md`), en español rioplatense
(vos/tenés).

## 2. Sistema visual: "Tapas"

- **La base no tiene color.** Papel de día (`--gr-bg #F6F6F8`, superficie blanca, tinta `#121216`) y casi negro de noche
  (`#0C0C0E`, superficie `#1A1A1E`, tinta `#F3F3F6`), según el modo del teléfono (`prefers-color-scheme`). El color lo
  ponen las fotos de los deseos.
- **Un solo acento de marca: verde esmeralda** (`--gr-acento #10B66E`), liso y en degradé (`#3CD592 → #10B66E →
  #0A9A5B`), siempre con tinta encima: el botón principal, la pestaña activa, el +, los chips elegidos, los avisos sin
  leer, el moño del logo y los sellos. Como texto va en su tono oscuro (`--gr-acento-oscuro #08794A`) de día.
- **Las tapas:** el encabezado de cada lista (y la tarjeta grande de Inicio) va pintado con su color, que se oscurece y
  se funde con el fondo. Verde de la marca en la lista de una persona, uva (`#5B3FB5`) en una lista en común
  (`src/lib/tapas.ts`). Lo de adentro va en blanco; los botones, blancos o de vidrio ahumado.
- **Azul** (`--gr-blue #2D5BD0`) para avisos y festejos (codazos), y en su versión suave para las listas en común en Tu
  gente. Las fechas especiales y los pasos de los gustos tienen cada uno su paleta (`src/lib/colores-fechas.ts`,
  `src/lib/colores-gustos.ts`).
- **Tipografía:** todo en Hanken Grotesk (pesos 400 a 900, `next/font`). Los títulos en 900, grandes y apretados
  (`.gr-title`, 36 px); las secciones en 800 (`.gr-heading`, 22 px); las etiquetas en mayúsculas de 11,5 px
  (`.gr-label`). Precios y números en variante tabular.
- **Forma:** botones y chips en píldora; tarjetas con borde fino, casi sin sombra, radio 20 (26 en las destacadas); la
  foto del deseo a sangre, más alta que ancha (4:5). Sin foto, un regalito gris: es un caso de primera clase.
- **Navegación:** barra inferior flotante de vidrio esmerilado con cuatro secciones (Inicio, Gente, Regalos, Vos) y el +
  al costado, que abre el agregado.
- **Movimiento:** con CSS (transiciones y keyframes, sin librerías). Lo que entra lo hace con un resorte corto; nada se
  mueve para siempre al lado de lo que hay que leer (el carrusel de Inicio y la portada dan una vuelta y paran) y todo
  respeta `prefers-reduced-motion`.

## 3. Accesibilidad (lo que el código garantiza)

- El zoom queda libre. Ningún campo lleva letra de menos de 16 px (así el iPhone no hace zoom al enfocarlo).
- Sobre las tapas (verde y uva) y sobre las fotos, el blanco pasa 4,5:1: por eso la tapa arranca oscurecida y el vidrio
  de los botones es ahumado.
- Los botones, los chips, las pestañas y los links chicos ("Ver más") se tocan en 44 × 44 aunque se dibujen más chicos
  (`.gr-toque`).
- Se usa en vertical y con el teléfono de costado. Lo fijo respeta los bordes del teléfono (`env(safe-area-inset-*)`).
- `tests/accesibilidad.test.ts` fija estas reglas.

## 4. Regla de la sorpresa (restricción dura de diseño)

En lo que ve el **dueño** (Mi lista, su deseo) está PROHIBIDO mostrar: estados de reserva, contadores ("quedan X"),
actividad ("3 personas vieron tu lista"), insignias o reordenamientos que delaten movimiento. La lista del dueño es
estática y tranquila. En lo que ve **quien regala** pasa lo contrario: los estados son la información principal.

## 5. Pantallas (las rutas reales)

- **Portada** `/`: las cartas de lo que hace la app y "Entrar con Google".
- **La lista compartida** `/l/[token]` y **el deseo** `/l/[token]/item/[id]`: a lo que llega la gente desde WhatsApp,
  sin cuenta. Es la pantalla del producto: ver, reservar, armar un regalo grupal.
- **Inicio** `/inicio`: lo que viene (la tarjeta del próximo cumple, los avisos que te piden algo, lo nuevo de tus amigos).
- **Tu gente** `/gente`, **Regalos y Cuentas** `/regalos` y `/cuentas`, **Mi lista** `/mi-lista` (y las listas en común,
  `/grupos/[id]`), **Todo el año** `/eventos`, **Avisos** `/avisos`, **Perfil** `/perfil` con los gustos.
- **Agregar y editar un deseo** `/agregar`, `/editar/[id]`: la tarjeta del deseo es el formulario; pegar el link trae
  nombre, foto y precio.
- **Amigo invisible** `/invisible/[id]` y **la bienvenida** `/bienvenida`.

## 6. Restricciones técnicas

- Next.js (App Router) + Tailwind v4: clases `gr-*` de `tokens.css` más utilidades con los tokens (`text-gr-ink`,
  `bg-gr-soft`). Sin librerías de componentes ni de animación.
- Server components por defecto: la interactividad va en client components chicos.
- Las fotos de los deseos son URLs externas u opcionales: diseñar siempre el caso sin foto.
- Los textos y los estados son los del código; el glosario (regalo grupal, lista en común, Todo el año, liberar) se respeta.
