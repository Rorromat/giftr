# Wishy Fase 1 (PoC) — Diseño técnico AWS

**Fecha:** 2026-08-16 · **Reemplaza el stack de:** [2026-08-08-wishy-fase1-design.md](./2026-08-08-wishy-fase1-design.md)
**Fuente de producto:** [wishy-concepto.md](../../../wishy-concepto.md) — el alcance funcional de Fase 1 no cambia, solo la plataforma.

## Decisión de stack

| Capa | Antes | Ahora |
|---|---|---|
| Base de datos | Postgres (Neon) + Drizzle | **DynamoDB** (single-table) |
| Backend | Next.js server actions en Vercel | **Lambda (Node 20, TS) + API Gateway HTTP API** |
| Autenticación | Auth.js + Google | **Cognito User Pools** (Google como IdP federado) + guest por link sin cuenta |
| Frontend | Next.js full-stack | Cliente aparte (SPA/PWA) que consume la API — fuera de este repo backend |
| Infra | — | **AWS SAM** (`template.yaml`), bundling con esbuild |

## Arquitectura

```
Cliente (PWA)
   │  Authorization: Bearer <JWT Cognito>   (usuarios)
   │  x-wishy-guest: <guestId>.<secret>     (invitados por link)
   ▼
API Gateway (HTTP API)
   ├── rutas /me/* → JWT authorizer (Cognito User Pool)
   └── rutas /l/{token}/* y /guests → públicas (identidad resuelta en Lambda)
   ▼
Lambdas (una por grupo de rutas, handlers TS bundleados con esbuild)
   ▼
DynamoDB (tabla única `wishy` + 2 GSI)
```

- **Cognito User Pool** con Google como identity provider federado (hosted UI / OAuth code flow). El `sub` del JWT es el id de usuario en la tabla.
- **Guests** no pasan por Cognito: `POST /guests` crea una identidad `{nombre, email?}` y devuelve `guestId` + `secret`; el cliente lo persiste (cookie/localStorage) y lo manda en `x-wishy-guest`. Sus claims valen igual que los de un usuario.
- **Promoción de guest a usuario:** en `POST /me/bootstrap` (primer login), si el email verificado del JWT coincide con el email de una identidad guest, se reasignan sus claims y comments al usuario y se marca `promotedToUserId`.

## Modelo de datos — DynamoDB single-table

Tabla `wishy` (`PK`, `SK`), GSI1 (`GSI1PK`, `GSI1SK`), GSI2 (`GSI2PK`, `GSI2SK`).

| Entidad | PK | SK | GSI1 (lookup) | GSI2 (lookup) |
|---|---|---|---|---|
| User | `USER#<sub>` | `PROFILE` | — | — |
| List | `LIST#<listId>` | `META` | `TOKEN#<shareToken>` → lista por link | `OWNER#<sub>` → lista por dueño |
| Item | `LIST#<listId>` | `ITEM#<itemId>` | — | — |
| Claim | `ITEM#<itemId>` | `CLAIM#<claimId>` | `CLAIMER#<user\|guest>#<id>` → mis reservas / herencia guest | — |
| Comment | `ITEM#<itemId>` | `COMMENT#<isoTs>#<id>` | — | — |
| GuestIdentity | `GUEST#<guestId>` | `PROFILE` | `GEMAIL#<email>` → promoción | — |
| Notification | `RECIP#<user\|guest>#<id>` | `NOTIF#<isoTs>#<id>` | — | — |

Patrones de acceso cubiertos: lista por token (GSI1), lista por dueño (GSI2), items de una lista (Query PK), claims y comments de un item (Query PK con prefijo de SK), claims por claimer (GSI1), notificaciones por destinatario (Query PK), guest por email (GSI1).

Los items guardan un contador `claimCount` (reservas activas + compras) que habilita la reserva condicional. **El contador jamás se serializa hacia el dueño.**

## Regla de la sorpresa (requisito #1, sin cambios)

- Única función serializadora en `src/domain/serialize.ts`: si el que pide es dueño del item, la respuesta se arma por **allowlist** — sin claims, sin comments, sin `claimCount`, sin ningún derivado.
- Ningún handler devuelve claims/comments crudos sin pasar por ahí. Los endpoints de detalle/claims/comments devuelven **404** al dueño (no 403: un 403 ya es una señal).
- `GET /l/{token}` con JWT del dueño devuelve la vista dueño — el servidor decide por identidad, no por URL.
- Test de oro (desde el día uno): el dueño no puede obtener estados de sus items por ningún endpoint, incluso pidiendo claims/comments por ID directo.

## Reglas de negocio → primitivas DynamoDB

1. **Reserva atómica** (antes `SELECT ... FOR UPDATE`): `TransactWriteItems` con dos operaciones — `Update` del item incrementando `claimCount` con `ConditionExpression claimCount < cantidad AND estadoDueno = activo`, más `Put` del claim. El segundo en llegar recibe `TransactionCanceledException` → "recién lo reservó otra persona".
2. **Cantidad > 1:** el mismo contador admite hasta N claims; con N compras el item queda `comprado` para regaladores. El dueño nunca ve contadores.
3. **Idea repetible:** la transacción omite la condición de cupo (claims ilimitados en paralelo); cada claim anota "qué compré", visible solo entre regaladores.
4. **Expiración sin cron (lazy):** `expiresAt = reserva + 14 días`. Toda lectura de claims detecta vencidos y los marca `expirado` en una transacción idempotente (`Update` claim con condición `estado = reservado` + `Update` item decrementando `claimCount` con condición `claimCount > 0`). No se usa TTL de DynamoDB porque borra el historial.
5. **"Ya lo tengo / no lo quiero" y edición con claim activo:** se escriben `Notification` in-app para cada claimer afectado. Al dueño no se le dice nada.
6. **Auto-regalo prohibido:** validado en servidor comparando identidad del claimer contra `ownerId` del item.

La lógica de decisión vive en **funciones puras** (`src/domain/*`): reciben item + claims + viewer + now y devuelven un "plan" (escrituras y condiciones) o un error de negocio. La capa `src/store/dynamo.ts` solo ejecuta planes. Así las reglas se testean con Vitest sin emulador, análogo al rol que cumplía PGlite.

## API

**Autenticadas (JWT Cognito):**

| Método y ruta | Qué hace |
|---|---|
| `POST /me/bootstrap` | Crea user + lista con `shareToken` si no existen; promociona guest por email. |
| `GET /me/list` | Vista dueño (serialización allowlist). |
| `POST /me/items` · `PATCH /me/items/{id}` · `DELETE /me/items/{id}` | CRUD de items (editar notifica a claimers). |
| `POST /me/items/{id}/status` | `lo_tengo` / `no_lo_quiero` — archiva y notifica claimers. |
| `GET /me/claims` | Mis reservas como regalador. |
| `GET /me/notifications` · `POST /me/notifications/read` | In-app only. |

**Públicas (identidad opcional: JWT o `x-wishy-guest`):**

| Método y ruta | Qué hace |
|---|---|
| `POST /guests` | Crea identidad guest → `guestId` + `secret`. |
| `GET /l/{token}` | Lista: vista regalador, o vista dueño si el JWT es del dueño. |
| `GET /l/{token}/items/{id}` | Detalle con claims/comments — 404 para el dueño. |
| `POST /l/{token}/items/{id}/claims` | Reservar (requiere identidad; guest se registra antes). |
| `POST /l/{token}/items/{id}/claims/{claimId}/purchase` · `.../release` | Marcar comprado / liberar (solo el claimer). |
| `POST /l/{token}/items/{id}/comments` | Comentario en la capa oculta. |
| `GET /guests/me/notifications` | Notificaciones del guest. |

## Testing

- **El test de oro** sobre la serialización (dueño ciego por cualquier vía).
- Reglas de negocio como funciones puras: plan de reserva (cupo, repetible, auto-regalo), expiración lazy idempotente, cantidad > 1, estados derivados para regaladores.
- La atomicidad real la garantizan las `ConditionExpression` dentro de `TransactWriteItems`; los tests verifican que cada plan lleve la condición correcta. Smoke test de integración contra AWS luego del primer deploy.

## Deploy

`sam build && sam deploy --guided`. Parámetros: `GoogleClientId`, `GoogleClientSecret` (para el IdP de Cognito). Salidas: URL de la API, ids del User Pool y del client. DynamoDB en on-demand (PAY_PER_REQUEST) — costo ~cero en PoC.

## Criterio de éxito

El del concepto: un evento familiar real donde todos los regalos salgan de la lista, sin duplicados y con la sorpresa intacta.
