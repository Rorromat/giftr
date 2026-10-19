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
src/lib/          Reglas de negocio: regla de la sorpresa, reservas, invitados, avisos
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

5. **Redeploy.** *Deployments → … → Redeploy*. El build (`npm run vercel-build`) aplica las
   migraciones y después compila, así que la base queda lista sola en cada deploy.

## Backend AWS

`aws-backend/` es una re-arquitectura de la Fase 1 sobre DynamoDB, Lambda, API Gateway y Cognito.
Es independiente de la app: tiene su propio `package.json`, tests e infraestructura SAM. Ver
[aws-backend/README.md](./aws-backend/README.md).
