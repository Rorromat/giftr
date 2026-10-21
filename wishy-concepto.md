# Wishy — Documento de concepto

**Versión:** 1.0 · Agosto 2026
**Propósito de este documento:** base de ideación para llevar a Claude Code (plan de implementación) y Claude Design (diseño visual). Define producto, reglas de juego, UX, pantallas, modelo de datos conceptual y modelo de negocio.

---

## 1. Visión

**Wishy es la app donde cada persona mantiene su lista de regalos deseados, y su gente elige qué regalarle sin arruinar la sorpresa.**

El problema real que resuelve tiene dos caras:

- **Para el que regala:** "no sé qué regalarle" y "ojalá no se lo regale otro también".
- **Para el que recibe:** "me regalan cosas que no quiero" y "me da vergüenza pedir".

La magia está en un único principio: **todos ven todo, menos lo tuyo.** Vos ves qué van a regalarle a tu hermana, tu primo y tu vieja (y coordinás con ellos), pero nadie te muestra jamás qué te van a regalar a vos. La app es la celestina invisible que garantiza cero regalos duplicados y 100% de sorpresa.

### Propuesta de valor en una frase por audiencia

| Audiencia | Frase |
|---|---|
| Dueño de lista | "Pedí lo que querés sin pedirlo." |
| El que regala | "Acertá siempre, sin repetir y sin gastar de más." |
| El grupo/familia | "Coordinen los regalos sin el grupo de WhatsApp secreto." |

---

## 2. El principio rector: la Regla de la Sorpresa

Toda decisión de producto se subordina a esta regla. Es el corazón de Wishy y lo que la diferencia de una wishlist de Amazon.

**Regla de la Sorpresa:** el dueño de una lista **nunca** puede ver, inferir ni deducir el estado de reserva o compra de sus propios items. Los demás participantes ven todo.

Consecuencias de diseño que se derivan de la regla:

1. **Dos vistas de la misma lista.** La "vista dueño" (gestiono mis deseos) y la "vista regalador" (veo estados, reservo, coordino). Son la misma lista con dos renders distintos.
2. **Cero señales indirectas al dueño.** Nada de "3 personas vieron tu lista esta semana", ni contadores, ni reordenamientos que delaten actividad. El dueño ve su lista estática y tranquila.
3. **La coordinación entre regaladores es invisible.** Comentarios, reservas y regalos grupales viven en una capa que el dueño no tiene forma de abrir, ni siquiera por URL directa (validación en servidor, no solo en UI).
4. **Caso pareja/familia:** si una lista tiene dos dueños (lista de pareja), **ambos** dueños son ciegos a los estados de esos items. La ceguera se define por "sos dueño del item", no por "sos dueño de la lista".
5. **El dueño puede romper su propia sorpresa solo después del evento** (ver "Post-evento y revelado", sección 4.8), y siempre por acción explícita.

---

## 3. Usuarios y roles

| Rol | Qué puede hacer |
|---|---|
| **Dueño (owner)** | Crear/editar sus listas e items, categorizarlos, compartirlos, marcar "ya lo tengo / ya no lo quiero", ver su historial. No ve estados de reserva propios. |
| **Regalador (giver)** | Ver listas compartidas con él, filtrar, reservar items, marcar comprado, comentar en la capa oculta, iniciar o sumarse a regalos grupales. |
| **Invitado por link (guest)** | Versión liviana del regalador para el PoC: entra por link sin instalar nada, se identifica con su nombre y puede reservar. Clave para que la abuela participe. |
| **Co-dueño** | Miembro de una lista compartida (pareja/familia). Igual que dueño, con ceguera compartida sobre los items de esa lista. |

Una misma persona es dueña de sus listas y regaladora en las de los demás — los roles son por lista, no por cuenta.

---

## 4. Features core

### 4.1 Listas

- Cada usuario arranca con **"Mi wishlist"** (lista permanente, siempre viva). Es la fuente de verdad de "cosas que quiero".
- Se pueden crear **listas adicionales por ocasión** (cumpleaños, Navidad, casamiento, baby shower). Un item puede pertenecer a la wishlist permanente y "asomarse" a una lista de ocasión sin duplicarse.
- **Listas compartidas** con co-dueños: "Regalos para nuestra casa" (pareja), "Cosas para el bebé" (padres). Todos los co-dueños editan; todos son ciegos a los estados.
- Privacidad por lista: **solo con link**, **solo mi círculo/grupo**, o **pública** (v2).

### 4.2 Items: exactos e ideas

Dos tipos de item, porque la vida real tiene de los dos:

**Item exacto** — "quiero ESTO":
- Link directo a tienda (al pegar el link, la app intenta traer foto, título y precio automáticamente — v2; en el MVP se cargan a mano).
- Foto, precio aproximado, notas del dueño ("talle M", "en negro por favor").
- Cantidad deseada: "6 copas de vino" admite hasta 6 reservas independientes.

**Item idea ("algo así")** — "quiero algo de este estilo":
- Descripción libre ("Legos, los que sean", "algo para el mate", "un libro de historia argentina").
- Rango de precio orientativo en vez de precio exacto.
- Ejemplos/links opcionales como referencia, no como pedido literal.
- Flag **"se puede repetir"**: para "medias divertidas" está bien que dos personas regalen; para "una vaporera" no.
- Cuando alguien reserva una idea, puede anotar **qué compró concretamente** (visible solo para otros regaladores): "reservé 'Legos' → compré el set Batman". Así, si el item admite repetición, el siguiente sabe qué evitar.

**Atributos comunes a todo item:**
- Categoría (definidas por el dueño + sugeridas: Tecnología, Casa, Ropa, Libros, Experiencias, Hobbies…).
- Prioridad en tres niveles: **Lo quiero mucho / Me gustaría / Idea suelta**. Le da al regalador una señal honesta sin que el dueño tenga que rogar.
- Estado del dueño: activo / **"ya lo tengo"** / **"ya no lo quiero"** (archivan el item; ver caso borde en sección 5).

### 4.3 Reservas y compras (el "claim")

Ciclo de vida de un item desde la vista regalador:

```
DISPONIBLE ──reservar──▶ RESERVADO ──"ya lo compré"──▶ COMPRADO
     ▲                       │
     └──── expira o libera ──┘
```

- **Reservar**: "yo me encargo de este". Todos los regaladores ven quién lo reservó. El dueño no ve nada.
- **Expiración de reserva**: al reservar se fija un plazo (default 14 días, o hasta 3 días antes del evento si hay evento asociado — lo que ocurra primero). A mitad de plazo la app avisa: "¿Conseguiste el termo? Te quedan 7 días". Si vence, el item vuelve a DISPONIBLE y se notifica a los interesados. Esto resuelve el clásico "lo marcó y nunca lo compró".
- **Liberar**: el regalador puede soltar la reserva manualmente en cualquier momento ("no lo conseguí en ningún lado").
- **"Ya lo compré"**: estado terminal. El item queda comprado a ojos de todos los regaladores. Opcional: anotar dónde y a qué precio (útil para el historial y para dividir gastos en grupales).
- **Comentarios ocultos por item**: hilo entre regaladores ("¿alguien sabe el talle exacto?", "yo lo vi más barato en X"). Invisible para el dueño, siempre.

### 4.4 Regalos grupales

Para los items caros, cualquiera puede convertir su reserva en **"regalo grupal"**:

- El iniciador abre el grupo sobre el item y define un mínimo orientativo de participantes o monto por cabeza (informativo, no vinculante).
- Otros regaladores se suman con un tap. Todos ven quiénes están adentro.
- Coordinación de plata: **en el MVP no se maneja dinero** — la app muestra participantes y un hilo de comentarios, y la transferencia se arregla por fuera (alias/MP en el comentario). Manejar pagos reales es un problema regulatorio que no hay que comprarse en la v1. (V3 posible: integración Mercado Pago para el pozo.)
- El iniciador (o cualquier participante designado) marca "ya lo compramos" cuando se concreta.

### 4.5 Grupos / círculos

- Grupos de personas: **Familia Mateus**, **Amigos del club**, **Trabajo**. Un grupo agrupa gente, no listas.
- Compartir una lista con un grupo = todos los miembros la ven como regaladores.
- Efecto red clave: al unirte al grupo "Familia", ves las listas de todos los que ya están — y ellos la tuya. Un solo onboarding habilita a toda la familia.
- Los grupos también alimentan el feed de eventos: "Se viene el cumple de Euge (grupo Familia) — todavía no elegiste nada de su lista".

### 4.6 Eventos y recordatorios

- Eventos con fecha: cumpleaños (recurrente anual, tomado del perfil), Navidad, Reyes, casamientos, baby showers, amigo invisible (v2).
- Un evento conecta: una o más listas + un grupo de personas + una fecha.
- Motor de recordatorios para regaladores: "faltan 2 semanas y no reservaste nada", "tu reserva vence antes del evento", "se sumó un regalo grupal para el cumple de papá".
- Al dueño solo le llegan recordatorios no-spoiler: "tu cumple está cerca, ¿tu lista está al día?".

### 4.7 Perfil de regalabilidad

Datos que hacen acertar incluso fuera de la lista:

- Talles (ropa, calzado), colores preferidos, gustos declarados.
- Sección **"No me regales"**: tan valiosa como la wishlist ("ya tengo termo", "no tomo vino", "nada de velas por favor").
- Fecha de cumpleaños (alimenta eventos automáticos).

### 4.8 Post-evento y revelado

- Pasado el evento, la app le pregunta al dueño qué recibió → esos items se archivan como "recibido" y salen de la lista.
- **Revelado opcional**: el dueño puede elegir ver la "película" de lo que pasó (quién reservó qué, el hilo del regalo grupal). Lindo momento emotivo, siempre opt-in y solo post-evento.
- **Historial de regalos**: registro personal de qué regalaste a quién y cuándo ("¿qué le regalé a mamá el año pasado?"). Memoria que ningún grupo de WhatsApp tiene.

---

## 5. Reglas de juego y casos borde

Esta sección es la que más vale llevar a Claude Code tal cual — son las reglas de negocio.

1. **Dueño ciego, siempre en servidor.** La API nunca devuelve estados de reserva de items cuyo dueño (o co-dueño) sea el solicitante. No es un filtro de frontend. Si el que pide no se identificó (sin sesión ni nombre), puede ser el dueño sin su sesión: ve los deseos sin estados hasta que diga quién es.
2. **"Ya lo tengo / ya no lo quiero" con reserva activa.** Si el dueño archiva un item que alguien ya reservó o compró, el regalador recibe una notificación discreta e inmediata: "Un item que reservaste fue dado de baja por su dueño — te conviene elegir otro". Al dueño no se le dice nada (decirle "ojo que alguien ya lo compró" rompería la regla). Es el caso borde más doloroso: la app debe minimizarlo avisando al regalador lo antes posible.
3. **Edición de item reservado.** Si el dueño edita un item reservado (cambia talle, color, link), los regaladores con reserva reciben la notificación del cambio.
4. **Cantidad > 1.** El item muestra a los regaladores "quedan 4 de 6". Al llegar a 0 pasa a COMPRADO. El dueño solo ve su item, sin contadores.
5. **Carrera por reservar.** La reserva es atómica: el primero que confirma se lo queda; el segundo ve "recién lo reservó otra persona" y el hilo para coordinar (quizás lo convierten en grupal).
6. **Item idea con repetición permitida** admite múltiples reservas en paralelo, cada una con su nota de "qué compré".
7. **Guest por link.** El guest se identifica con su nombre (su cookie va firmada: es su credencial). Su reserva vale igual que la de un usuario registrado. Si después entra con Google en ese mismo navegador, su cuenta hereda sus reservas, salvo las de listas propias.
8. **Un regalador con dos listas de la misma persona** (wishlist + lista de cumpleaños): los items compartidos entre ambas muestran el mismo estado — el estado vive en el item, no en la relación item-lista.
9. **Auto-regalo prohibido**: nadie puede reservar items propios (obvio, pero hay que validarlo — cubre el caso del co-dueño curioso).
10. **Privacidad del historial**: lo que reservaste/compraste solo lo ven los regaladores de ese círculo, no es público ni cross-grupo.

---

## 6. UX y pantallas

*(Aplicando los principios del skill mobile-app-ui-design: thumb zone, grilla de 8pt, regla 60/30/10, peak-end rule, estados vacíos como oportunidad.)*

### 6.1 Contexto de diseño

- **Plataforma v1:** web app mobile-first (base 375px), instalable como PWA. El 90% del uso va a venir de un link abierto desde WhatsApp — la primera pantalla que la mayoría verá es la **lista de otro**, no el onboarding. Diseñar para ese orden.
- **Vibe:** cálido y festivo sin ser infantil. Es una app de afecto (regalar bien = querer bien), no de e-commerce. Convención de industria más cercana: social/lifestyle con toques de e-commerce (foto de producto protagonista, CTAs claros).
- **Sensación buscada:** para el regalador, *alivio* ("ya está, resuelto, no me duplico"); para el dueño, *ilusión* sin ansiedad.

### 6.2 Dirección visual sugerida (para Claude Design)

- 60% base neutra cálida (blanco hueso / gris muy claro), 30% tinta oscura para texto, 10% un acento festivo — un coral/terracota o un violeta cálido; evitar el rojo puro (reservado para "reserva por vencer").
- Una familia tipográfica, 4 tamaños, 2 pesos. Números de precio en variante tabular.
- Tarjetas `rounded-2xl` con foto del producto protagonista, sombras suaves teñidas.
- Estados de reserva con color semántico consistente: disponible (neutro), reservado (acento al 10-20%), comprado (verde suave + check).
- Micro-animación clave: el acto de **reservar** merece el momento peak (ver 6.5).

### 6.3 Arquitectura de navegación

Tab bar inferior de 4 secciones (thumb zone):

```
[ Inicio ]  [ Mis listas ]  [ (+) ]  [ Gente ]  [ Perfil ]
```

- **Inicio**: próximos eventos + actividad no-spoiler ("Euge agregó 3 items a su lista").
- **Mis listas**: vista dueño.
- **(+) central**: agregar item rápido (la acción más frecuente debe ser la más barata).
- **Gente**: grupos, listas compartidas conmigo, buscador de personas.
- **Perfil**: mi perfil de regalabilidad, historial, ajustes.

### 6.4 Pantallas principales

**P1 · Lista ajena (vista regalador) — LA pantalla del producto**
- Header: avatar y nombre del dueño, evento asociado con countdown ("Cumple en 12 días").
- Filtros expuestos (no escondidos en un drawer): precio máximo (chips: hasta $20k / $50k / $100k+), categoría, estado (disponibles / todos).
- Cards de item: foto, título, precio, prioridad (indicador sutil, ej. corazones), badge de estado. Items COMPRADOS se atenúan y van al fondo; DISPONIBLES primero.
- CTA por card en thumb zone: **Reservar** (primario) · Ver más.
- Estado vacío: "Todavía no cargó nada — mandale un codazo 👉 [Pedile que arme su lista]".

**P2 · Detalle de item (vista regalador)**
- Foto grande, precio, notas del dueño (talle/color), link a tienda (abre externo).
- Estado y quién lo tiene reservado. Botones: Reservar / Liberar / Ya lo compré / Proponer regalo grupal.
- Hilo de comentarios ocultos al dueño, claramente marcado: "🤫 Esto no lo ve Euge".

**P3 · Mi lista (vista dueño)**
- Mis items agrupados por categoría, con prioridad editable por drag o tap.
- Sin ningún indicador de actividad ajena (regla de la sorpresa).
- CTA principal: **Compartir lista** (genera link para WhatsApp) — es el momento de crecimiento viral, tiene que estar siempre a mano.
- Estado vacío = onboarding real: "Agregá lo primero que se te venga a la cabeza. ¿Un link? Pegalo acá."

**P4 · Agregar item**
- Primero un campo único: **pegar link o escribir**. Si es link → item exacto (v2 autocompleta foto/precio; MVP pide foto y precio a mano). Si es texto → sugiere item idea.
- Selección antes que input: chips de categoría, chips de rango de precio, selector de prioridad de 3 posiciones. Flag "se puede repetir" solo visible en items idea.
- Máximo 1 pantalla, sin wizard. Agregar un item debe tomar <30 segundos.

**P5 · Inicio**
- Próximos eventos como cards con countdown y estado personal: "Cumple de mamá · 8 días · ⚠️ todavía no reservaste nada".
- Feed no-spoiler: items nuevos en listas que sigo, regalos grupales abiertos donde me esperan.

**P6 · Grupos y gente**
- Mis grupos con avatares apilados; crear grupo e invitar por link de WhatsApp.
- Dentro del grupo: miembros y sus listas, próximos cumpleaños del grupo ordenados por cercanía.

**P7 · Regalo grupal**
- Item arriba, participantes con avatares, monto orientativo por cabeza recalculado en vivo ("si son 4, ~$15.000 c/u"), botón **Me sumo**, hilo de coordinación.

**P8 · Perfil**
- Talles, "no me regales", cumpleaños, historial de regalos hechos y recibidos.

### 6.5 Momentos peak-end

- **Pico (regalador):** al confirmar una reserva → animación breve de "regalo asegurado" (moño que se ata, confetti sutil) + copy: "Listo. Nadie más puede duplicarte. 🤫". Es el momento de alivio — hacerlo memorable.
- **Pico (dueño):** al compartir la lista por primera vez → "Tu lista ya está en manos de tu gente. Ahora, a hacerse el sorprendido."
- **Final post-evento:** el revelado opcional como pantalla-momento: la "película" del detrás de escena de tus regalos. Es el cierre emotivo que hace volver el año siguiente.
- **Pico negativo a suavizar:** reserva expirada ("se te venció el termo") — tono empático, un tap para re-reservar o liberar, nunca culpa.

---

## 7. Modelo de datos conceptual

Para el plan de implementación en Claude Code. Entidades y relaciones clave:

- **User** (perfil, cumpleaños, talles, "no me regales")
- **List** (dueño/s vía **ListOwnership** para soportar co-dueños; tipo: permanente/ocasión/compartida; privacidad)
- **Item** (pertenece a un dueño-conjunto; tipo exacto/idea; precio o rango; cantidad; prioridad; flag repetible; estado del dueño: activo/tengo/no-quiero; los estados de reserva NO viven acá sino en Claim)
- **ListItem** (relación item↔lista, permite un item en varias listas)
- **Claim** (item, regalador o guest, estado reservado/comprado/liberado/expirado, vence_en, nota "qué compré")
- **GroupGift** (item, iniciador, participantes, estado)
- **Circle** (grupo de personas) y **CircleMember**
- **Event** (fecha, recurrencia, listas y círculo asociados)
- **Comment** (hilo por item, visible solo para no-dueños)
- **GuestIdentity** (nombre, ligado a sus claims; se une a un User si entra con Google en el mismo navegador)

**Regla de oro para la API:** el serializer de Item hacia un dueño/co-dueño excluye Claims, Comments y GroupGifts. Test de integración obligatorio: "el dueño no puede obtener estados de sus items por ningún endpoint".

---

## 8. Roadmap propuesto

**Fase 1 — PoC web (validar con tu familia y amigos):**
cuentas simples + acceso guest por link · una wishlist por usuario + categorías · items exactos e idea (carga manual) · reservar/comprar con expiración · comentarios ocultos · compartir por WhatsApp · la regla de la sorpresa impecable.

**Fase 2 — Web completa:**
eventos y recordatorios · grupos/círculos · regalos grupales (sin plata) · listas de ocasión y co-dueños · scraping de links (foto/precio automático) · perfil de regalabilidad · revelado post-evento · notificaciones push (PWA).

**Fase 3 — Apps nativas iOS/Android:**
share extension ("compartir a Wishy" desde cualquier tienda o Instagram — el killer feature nativo) · notificaciones ricas · widgets de countdown · amigo invisible · integración de pagos para grupales (evaluar Mercado Pago).

**Criterio de éxito del PoC:** que en un evento real (un cumpleaños de tu familia) todos los regalos salgan de la lista, no haya duplicados y la sorpresa se mantenga. Una sola Navidad exitosa vale más que cualquier métrica.

---

## 9. Modelo de negocio

El usuario nunca debería pagar por la mecánica central (la regla de la sorpresa es el producto; ponerle peaje mata el efecto red). Caminos de monetización en orden de menor a mayor fricción:

1. **Afiliados (principal y natural):** los links a tiendas se convierten en links de afiliado (Mercado Libre tiene programa de afiliados; Amazon para el mercado internacional). El usuario no paga nada; Wishy cobra comisión por compras concretadas. Alineación perfecta: la app gana solo cuando alguien acierta un regalo. En v2, sugerir productos con link afiliado para los items "idea" ("¿'algo para el mate'? Mirá estos").
2. **Premium personal (suscripción baja):** listas ilimitadas de ocasión, revelado post-evento con más detalle, historial completo multi-año, temas visuales. Todo lo social queda gratis.
3. **Premium de eventos:** modo organizador para casamientos y baby showers (lista de regalos del evento, RSVP, agradecimientos automatizados). Acá hay disposición a pagar real — el mercado de listas de casamiento ya paga.
4. **B2B más adelante:** tiendas que pagan por aparecer como sugerencia en items idea (marcado como sugerido, nunca invasivo), o gift cards con comisión.

**Anti-modelo:** publicidad display y venta de datos. Wishy sabe qué desea la gente — la confianza es el activo; quemarla por banners sería regalar el negocio.

---

## 10. Preguntas abiertas

1. ¿El revelado post-evento es opt-in del dueño, o también requiere consentimiento de los regaladores? (Propuesta: los regaladores marcan su reserva como "revelable" o anónima.)
2. ¿Amigo invisible dentro de Wishy en v2? Encaja natural con la regla de la sorpresa y es un gran gancho de adquisición pre-Navidad.
3. ¿Qué pasa con reservas activas cuando pasa el evento y nadie marcó "comprado"? (Propuesta: expiran a los 7 días post-evento con aviso.)
4. Nombre y dominio: "Wishy" — verificar disponibilidad de dominio y marcas antes de encariñarse del todo.
5. ¿Moneda? Para PoC, precio como texto libre con símbolo; multi-moneda real recién si se internacionaliza.

## 11. Próximos pasos

1. **Claude Code:** llevar este documento y pedir el plan de implementación de la Fase 1 (stack sugerido: web app mobile-first/PWA; la regla de oro de la API de la sección 7 como requisito de test desde el día uno).
2. **Claude Design:** llevar la sección 6 (dirección visual + pantallas P1-P8) y diseñar primero P1 (lista ajena), P3 (mi lista) y P4 (agregar item) — el corazón del PoC.
3. **Validación en la vida real:** elegir el próximo cumpleaños familiar como piloto.

