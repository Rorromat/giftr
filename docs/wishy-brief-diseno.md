# Wishy — Brief de diseño para Claude Design

**Objetivo:** rediseñar/pulir la UI del PoC ya construido (funciona, pero tiene estilo utilitario). No es un diseño desde cero: las pantallas, rutas, estados y copy ya existen en código (Next.js + Tailwind v4). El diseño debe ser implementable sobre eso.

## 1. Qué es Wishy (contexto en 4 líneas)

App de listas de regalos con una regla sagrada: **todos ven todo, menos lo tuyo**. El dueño arma su wishlist y la comparte por WhatsApp; su gente reserva regalos y coordina en secreto sin duplicarse. El dueño jamás ve qué le van a regalar. Sensación buscada: para el regalador **alivio** ("ya está, no me duplico"); para el dueño **ilusión** sin ansiedad. Es una app de afecto, no de e-commerce.

## 2. Dirección visual

- **60/30/10:** base neutra cálida (hoy `stone-50` blanco hueso), tinta oscura para texto (`stone-900`), acento festivo **coral/terracota `#E2725B`** (10%). Evitar rojo puro — reservado exclusivamente para "reserva por vencer".
- Verde suave para estado **comprado** (+ check). Ámbar para notificaciones.
- Una familia tipográfica, 4 tamaños, 2 pesos. Precios en variante tabular.
- Tarjetas `rounded-2xl`, foto de producto protagonista, sombras suaves teñidas.
- Cálido y festivo sin ser infantil. Convención cercana: social/lifestyle con toques de e-commerce.
- **Mobile-first, base 375px**, contenedor actual `max-w-md`. PWA instalable.
- Copy en español rioplatense (vos/tenés), ya escrito en el código — conservarlo.

## 3. Regla de la sorpresa (restricción dura de diseño)

En la **vista dueño** (P3) está PROHIBIDO mostrar: estados de reserva, contadores ("quedan X"), actividad ("3 personas vieron tu lista"), badges o reordenamientos que delaten movimiento. La lista del dueño es estática y tranquila. En la **vista regalador** (P1/P2) pasa lo contrario: los estados son la información principal. La capa de coordinación se marca explícitamente como secreta: "🤫 Esto no lo ve [nombre]".

## 4. Pantallas existentes (prioridad de diseño en este orden)

### P1 · Lista ajena — `/l/[token]` — LA pantalla del producto
El 90% de los usuarios entra acá primero, desde un link de WhatsApp, sin cuenta.
- Header: "Lista de {nombre} 🎁" + subtítulo "Elegí, reservá y no te duplicás con nadie."
- Banners contextuales arriba (notificaciones ámbar / vencimientos rojo).
- Chips de filtro (links): Todos · Disponibles · una por categoría.
- Cards: foto 80x80 (opcional), título, precio, "quedan X de Y" si cantidad>1.
- Estados por card: **Disponible** → botón coral "Reservar"; **Ya lo reservaste 🤫** (pill coral); **Reservado por {nombre}** (texto coral); **✓ Comprado** (verde, card atenuada `opacity-60`, va al fondo).
- Estado vacío: "Todavía no cargó nada — mandale un codazo 👉".
- **Momento peak a diseñar:** confirmar reserva merece micro-animación (moño/confetti sutil) + copy "Listo. Nadie más puede duplicarte. 🤫". Hoy no existe — es el pedido #1 de diseño.

### P3 · Mi lista — `/mi-lista`
- Header "Mi lista" + botón "+ Agregar".
- CTA principal: **Compartir por WhatsApp** (verde, siempre a mano — es el momento de crecimiento viral). Peak: al compartir por primera vez → "Tu lista ya está en manos de tu gente. Ahora, a hacerse el sorprendido."
- Items agrupados por categoría; cada card: título, precio, selector de prioridad inline (3 niveles: ❤️❤️❤️ Lo quiero mucho / ❤️❤️ Me gustaría / ❤️ Idea suelta), notas, botones "Ya lo tengo" / "Ya no lo quiero".
- Estado vacío = onboarding: "Agregá lo primero que se te venga a la cabeza."
- Recordar la sección 3: acá no hay NINGUNA señal de actividad.

### P4 · Agregar item — `/agregar`
- Una sola pantalla, <30 segundos. Campo único protagonista: "¿Qué querés? Pegá un link o escribí".
- Toggle "Quiero ESTO" / "Algo así" (exacto vs idea). Campos: link tienda, foto URL, precio, cantidad, rango (ideas), categoría (select con 6 sugeridas), prioridad, notas, checkbox "se puede repetir".
- Selección antes que input: chips/selectores por encima de campos de texto donde se pueda.

### P2 · Detalle de item — `/l/[token]/item/[id]`
- Foto grande, precio, notas del dueño ("📝 {nombre} dice: …"), link a tienda.
- Lista de claims ("🔒 Vos lo reservaste" / "✓ {nombre} lo compró — compró: {nota}").
- Si tengo reserva activa: input "¿Qué compraste?" + botón verde "Ya lo compré", y "Liberar reserva" discreto.
- Hilo de comentarios bajo el título "🤫 Esto no lo ve {nombre}".

### Componentes sueltos
- **GuestGate** (modal `<dialog>`): pide nombre (requerido) + email (opcional) al primer intento de reserva de un anónimo. Copy actual: "¿Quién sos? Así los demás saben que este regalo ya tiene dueño." + botón "Reservar 🤫" + Cancelar.
- **Banners**: ámbar = "'{item}' fue dado de baja por su dueño — te conviene elegir otro regalo." · rojo = "¿Conseguiste '{item}'? Te quedan N días de reserva." (tono empático, nunca culpa).
- **Landing `/`**: logo 🎁 Wishy + "Pedí lo que querés sin pedirlo." + botón "Entrar con Google".
- Íconos PWA 192/512 (hoy placeholders lisos coral — diseñar el ícono real).

## 5. Restricciones técnicas para que el diseño sea implementable

- Tailwind v4 utility classes; sin librerías de componentes ni animación (Framer etc.) salvo justificación fuerte — preferir CSS/keyframes.
- Server components: la interactividad extra requiere client components chicos — minimizar.
- Las fotos de items son URLs externas opcionales — diseñar el caso SIN foto como primera clase.
- Sin dark mode en Fase 1. Sin tab bar todavía (es de Fase 2; hoy la navegación es por links/botones).
- Los estados y textos listados arriba son los reales del código: mantener los mismos estados; el copy se puede pulir.
