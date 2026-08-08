# Wishy Fase 1 (PoC) — Diseño técnico

**Fecha:** 2026-08-08 · **Fuente:** [wishy-concepto.md](../../../wishy-concepto.md) (secciones 4, 5, 7 y 8)

## Alcance

**Entra (Fase 1 del roadmap):**
- Cuentas con Google OAuth + acceso guest por link (sin cuenta)
- Una wishlist por usuario, con categorías
- Items exactos e idea, carga manual (sin scraping)
- Reservar / marcar comprado / liberar, con expiración de reserva
- Comentarios ocultos entre regaladores
- Compartir lista por link (WhatsApp)
- Regla de la sorpresa validada en servidor
- Notificaciones solo in-app (sin email, sin push)

**No entra (Fase 2+):** eventos, grupos/círculos, regalos grupales, co-dueños, listas de ocasión, scraping de links, revelado post-evento, push, pagos.

## Stack

- **Next.js (App Router)** full-stack, un repo, un deploy en **Vercel**
- **Postgres en Neon** + **Drizzle ORM**
- **Auth.js** con proveedor Google
- Mobile-first (base 375px), PWA con manifest básico (instalable, sin service worker de push)
- Precio como texto libre con símbolo (sin multi-moneda, concepto §10.5)

## Modelo de datos

| Tabla | Campos clave |
|---|---|
| `users` | id, google_id, nombre, email, avatar_url |
| `lists` | id, owner_id (única por usuario en Fase 1), share_token |
| `items` | id, list_id, tipo (`exacto`\|`idea`), título, descripción/notas, foto_url, precio (texto), rango_precio (texto, solo idea), categoría (texto), prioridad (`mucho`\|`gustaria`\|`suelta`), cantidad (default 1), repetible (bool, solo idea), estado_dueño (`activo`\|`lo_tengo`\|`no_lo_quiero`), link_tienda |
| `claims` | id, item_id, claimer_user_id ∥ claimer_guest_id, estado (`reservado`\|`comprado`\|`liberado`\|`expirado`), expires_at, nota_que_compre, creado/actualizado |
| `comments` | id, item_id, author_user_id ∥ author_guest_id, texto, creado |
| `guest_identities` | id, nombre, email (opcional), promoted_to_user_id (nullable) |
| `notifications` | id, destinatario (user ∥ guest), tipo, item_id, leída, creado |

Omitidos a propósito: `list_items`, `circles`, `events`, `group_gifts` — entran en Fase 2 sin migración dolorosa porque el estado de reserva vive en `claims` (por item), no en la relación item↔lista.

## Regla de la sorpresa (requisito #1, no negociable)

- **Toda** lectura de items pasa por una única función serializadora en servidor. Si el solicitante es dueño del item: se excluyen claims, comments, notifications de regaladores y cualquier campo derivado (contadores, "quedan X de Y").
- No existe endpoint que devuelva claims o comments crudos sin pasar por esa función.
- El dueño no recibe señales indirectas: sin contadores de vistas, sin reordenar por actividad.
- **Test de integración obligatorio desde el día uno:** "el dueño no puede obtener estados de sus propios items por ningún endpoint" — incluye pedir la URL de comentarios/claims por ID directo.

## Reglas de negocio (concepto §5, subset Fase 1)

1. **Reserva atómica:** `UPDATE ... WHERE` condicional sobre disponibilidad; el que llega segundo recibe "recién lo reservó otra persona".
2. **Cantidad > 1:** hasta N claims independientes; al completarse N compras el item pasa a comprado para los regaladores. El dueño nunca ve contadores.
3. **Idea repetible:** admite claims en paralelo; cada claim puede anotar "qué compré", visible solo para regaladores.
4. **"Ya lo tengo / no lo quiero" con claim activo:** se archiva el item y se crea notificación in-app inmediata al regalador afectado. Al dueño no se le dice nada.
5. **Edición de item con claim activo:** notificación in-app al regalador con reserva.
6. **Auto-regalo prohibido:** validación en servidor de que el claimer no es dueño del item.
7. **Expiración sin cron:** `expires_at` = 14 días al reservar. Toda lectura de claims marca como `expirado` los vencidos en la misma operación y el item vuelve a disponible. Aviso "te quedan N días" como banner in-app al regalador (a mitad de plazo).
8. **Guest:** se identifica con nombre (+ email opcional) en un modal al primer claim; se persiste en cookie. Sus claims valen igual. Si luego crea cuenta con ese email, hereda claims y comments (update de `promoted_to_user_id` + reasignación).

## Pantallas

| Ruta | Pantalla (ref. concepto §6.4) |
|---|---|
| `/l/[token]` | P1 — Lista ajena, vista regalador/guest. Filtros expuestos (precio, categoría, disponibles). Comprados atenuados al fondo. CTA Reservar. |
| `/l/[token]/item/[id]` | P2 — Detalle: estado, quién reservó, Reservar/Liberar/Ya lo compré, comentarios "🤫 esto no lo ve [dueño]". |
| `/mi-lista` | P3 — Vista dueño: items por categoría, prioridad editable, CTA Compartir (link WhatsApp), cero señales de actividad. |
| `/agregar` | P4 — Una pantalla, <30 seg: campo único link-o-texto, chips de categoría y precio, prioridad, flag repetible en ideas. |
| `/login` | Google OAuth. Al registrarse se crea `users` + su `lists` con `share_token`. |

Si el dueño abre su propio `/l/[token]`, se le muestra la vista dueño (server decide por sesión, no la URL).

Dirección visual: concepto §6.2 (60/30/10, acento coral/terracota, cards rounded-2xl, micro-animación al reservar).

## Testing

- **El test de oro:** integración sobre la regla de la sorpresa (arriba).
- Tests de reglas de negocio: reserva atómica (concurrencia), expiración lazy, cantidad > 1, auto-regalo prohibido, herencia de claims del guest.
- Sin suite exhaustiva de UI en el PoC — la validación real es el cumpleaños piloto (concepto §8).

## Criterio de éxito

El del concepto: un evento familiar real donde todos los regalos salgan de la lista, sin duplicados y con la sorpresa intacta.
