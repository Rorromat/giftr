# GiftR

Pedí lo que querés sin pedirlo. Armás tu lista de deseos, la compartís por WhatsApp y tu gente
coordina los regalos en secreto: reservan, se avisan y nadie se duplica. Vos nunca ves quién
reservó qué.

- Concepto de producto: [wishy-concepto.md](./wishy-concepto.md)
- Diseño técnico de la Fase 1: [docs/superpowers/specs/2026-08-08-wishy-fase1-design.md](./docs/superpowers/specs/2026-08-08-wishy-fase1-design.md)

## Estructura

```
src/app/          Pantallas (Next.js App Router) y server actions
src/components/   Componentes del sistema visual "Sticker" (ui.tsx) y piezas con estado
src/lib/          Reglas de negocio: regla de la sorpresa, reservas, invitados, avisos, grupos
src/db/           Esquema Drizzle y cliente de Neon
drizzle/          Migraciones SQL
tests/            Vitest con PGlite (Postgres en memoria), incluido el test de oro de la sorpresa
aws-backend/      Backend serverless alternativo (DynamoDB + Lambda + Cognito), proyecto aparte
```

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar DATABASE_URL, AUTH_* y NEXT_PUBLIC_BASE_URL
npm run db:migrate           # crea las tablas
npm run dev                  # http://localhost:3000
npm test
```

## Publicarla en Vercel

Hacen falta una cuenta de Vercel, una base Neon (se crea desde Vercel) y credenciales de Google
para el login.

1. **Importar el repo.** En Vercel: *Add New → Project*, elegí `rodrigomateus-debug/wishy` (rama
   `main`). Vercel detecta Next.js solo; no cambies el *Root Directory*. El primer deploy va a
   fallar porque todavía no hay base de datos: es esperable.
2. **Base de datos.** En el proyecto: *Storage → Create Database → Neon* y conectala al proyecto.
   Eso crea la variable `DATABASE_URL` en todos los entornos.
3. **Login con Google.** En Google Cloud Console: *APIs & Services → Credentials → Create
   credentials → OAuth client ID* (tipo *Web application*). En *Authorized redirect URIs* poné
   `https://TU-PROYECTO.vercel.app/api/auth/callback/google`. Mientras la pantalla de
   consentimiento esté en modo *Testing*, agregá como *test users* los emails que van a probar.
4. **Variables de entorno.** En Vercel, *Settings → Environment Variables*:

   | Variable | Valor |
   |---|---|
   | `AUTH_SECRET` | una clave larga al azar (`npx auth secret` o `openssl rand -base64 32`) |
   | `AUTH_GOOGLE_ID` | el *Client ID* de Google |
   | `AUTH_GOOGLE_SECRET` | el *Client secret* de Google |
   | `NEXT_PUBLIC_BASE_URL` | `https://TU-PROYECTO.vercel.app` (arma el link que se comparte) |
   | `MELI_CLIENT_ID` | opcional: el *App ID* de una aplicación de [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar). Con `MELI_CLIENT_SECRET`, al pegar el link de una publicación de MercadoLibre en un deseo, el nombre, la foto y el precio salen de su API oficial (la página tiene un muro para los servidores). Sin las dos, se usa la página |
   | `MELI_CLIENT_SECRET` | opcional: la *Clave secreta* de esa aplicación |

5. **Redeploy.** *Deployments → … → Redeploy*. El build (`npm run vercel-build`) compila y, si
   salió bien y es el deploy a producción, aplica las migraciones: la base queda lista sola en cada
   deploy a producción.

**Previews y migraciones.** `DATABASE_URL` es la misma en todos los entornos, así que los previews
(cada push a una rama que no es `main`) **no** migran: si lo hicieran, cambiarían la base de
producción mientras `main` sigue sirviendo el código de antes, quizás por días. Un preview con
migraciones nuevas falla hasta que se mergea; si querés probarlo, dale al preview su propia base (una
rama de Neon en *Settings → Environment Variables → Preview*) y migrala a mano con
`DATABASE_URL=… npm run db:migrate`. Las migraciones corren mientras todavía sirve el deploy anterior
(unos segundos, hasta que se publica el nuevo): mergeá y dejá que salga el deploy a producción
enseguida.

**Volver atrás.** No vuelvas atrás (*Instant Rollback*) a un deploy de antes de la migración
`0008_listas_de_invitado` sin preparar la base: el código de antes no conoce los avisos nuevos (los
de cualquier tipo que no sea `item_baja` ni `item_editado` le tiran abajo las pantallas a quien los
tenga, así que primero hay que marcarlos como leídos) y trata como co-dueños a los que salieron de
un grupo o a los que sacaron (las filas de `list_members` con `salio_at`: volverían a editar y a
figurar como dueños). La cookie de los invitados cambió de nombre para que el código de antes no se
caiga con ella: para ese código, los invitados anotados después son visitantes sin nombre.

**Región.** `vercel.json` corre las funciones en `gru1` (São Paulo), la misma región que la base
Neon. Si la base se crea en otra región, cambiá `regions` a esa: cada pantalla hace varias consultas
seguidas y con la app y la base en continentes distintos cada clic tarda segundos.

## Backend AWS

`aws-backend/` es una re-arquitectura de la Fase 1 sobre DynamoDB, Lambda, API Gateway y Cognito.
Es independiente de la app: tiene su propio `package.json`, tests e infraestructura SAM. Ver
[aws-backend/README.md](./aws-backend/README.md).
