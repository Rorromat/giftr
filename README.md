# Wishy — backend serverless (AWS)

Backend de la Fase 1 de Wishy sobre **DynamoDB + Lambda + API Gateway + Cognito User Pools**.

- Concepto de producto: [wishy-concepto.md](./wishy-concepto.md)
- Diseño técnico AWS: [docs/superpowers/specs/2026-08-16-wishy-fase1-aws-design.md](./docs/superpowers/specs/2026-08-16-wishy-fase1-aws-design.md)

## Estructura

```
template.yaml        Infra SAM: tabla DynamoDB, HTTP API + JWT authorizer, Cognito, Lambdas
src/domain/          Reglas de negocio puras (regla de la sorpresa, planes de reserva)
src/store/           Acceso a DynamoDB — ejecuta los planes con TransactWriteItems
src/http/            Identidad (JWT Cognito / guest por header) y helpers de respuesta
src/handlers/        me.ts (rutas autenticadas) · public.ts (link compartido y guests)
tests/               Vitest: reglas de negocio + test de oro de la sorpresa
```

## Desarrollo

```bash
npm install
npm test          # 27 tests, incluye el test de oro de la regla de la sorpresa
npm run typecheck
```

## Deploy

Requiere [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) y credenciales de AWS.

```bash
sam build
sam deploy --guided
```

Parámetros opcionales: `GoogleClientId` / `GoogleClientSecret` (login con Google vía Cognito),
`CallbackUrl` (frontend), `CognitoDomainPrefix` (hosted UI). Los outputs incluyen la URL de la
API, el `UserPoolId`/`UserPoolClientId` y el dominio del hosted UI.

## Autenticación

- **Usuarios:** OAuth code flow contra el hosted UI de Cognito (Google federado). El cliente
  manda el **id token** en `Authorization: Bearer …`. Las rutas `/me/*` las valida el JWT
  authorizer de API Gateway; en las rutas públicas la Lambda verifica el Bearer con
  `aws-jwt-verify` para reconocer al dueño (y mostrarle su vista ciega).
- **Guests:** `POST /guests` devuelve `guestId` + `secret`; se mandan en
  `x-wishy-guest: <guestId>.<secret>`. Al crear cuenta con el mismo email, `POST /me/bootstrap`
  hereda sus reservas y comentarios.

## Garantías clave

- **Regla de la sorpresa:** única función serializadora por allowlist
  (`src/domain/serialize.ts`); el dueño recibe 404 en detalle/claims/comments incluso por ID
  directo. Cubierto por `tests/surprise-rule.test.ts`.
- **Reserva atómica:** `TransactWriteItems` con `ConditionExpression claimCount < cantidad`;
  el segundo en llegar recibe 409 "recién lo reservó otra persona".
- **Expiración sin cron:** lazy en cada lectura, idempotente por condición (14 días).
