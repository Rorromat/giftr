import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { Viewer } from '../domain/types.js';
import { getGuest } from '../store/dynamo.js';

export type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
export type ApiResult = APIGatewayProxyResultV2;

export function json(statusCode: number, body: unknown): ApiResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const notFound = (): ApiResult => json(404, { error: 'no_encontrado' });
export const badRequest = (msg: string): ApiResult => json(400, { error: msg });
export const unauthorized = (): ApiResult => json(401, { error: 'identidad_requerida' });
export const conflict = (msg: string): ApiResult => json(409, { error: msg });

export function parseBody<T>(event: ApiEvent): T | null {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface JwtIdentity {
  sub: string;
  nombre: string;
  email?: string;
  emailVerified: boolean;
}

/** Claims del JWT validado por el authorizer de API Gateway (Cognito). */
export function jwtIdentity(event: ApiEvent): JwtIdentity | null {
  const claims = event.requestContext.authorizer?.jwt?.claims as
    | Record<string, string | number | boolean>
    | undefined;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !sub) return null;
  return {
    sub,
    nombre: String(claims?.name ?? claims?.['cognito:username'] ?? 'Alguien'),
    email: typeof claims?.email === 'string' ? claims.email : undefined,
    emailVerified: String(claims?.email_verified) === 'true',
  };
}

/**
 * En rutas públicas no hay authorizer de API Gateway (los guests entran sin
 * cuenta), pero el dueño puede abrir su propio link con sesión: verificamos
 * el Bearer nosotros contra el User Pool. Sin esto, el dueño vería la vista
 * regalador de su propia lista y se rompería la sorpresa.
 */
async function verifyBearer(event: ApiEvent): Promise<Viewer | null> {
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  const userPoolId = process.env.USER_POOL_ID;
  const clientId = process.env.USER_POOL_CLIENT_ID;
  if (!auth?.startsWith('Bearer ') || !userPoolId || !clientId) return null;
  try {
    const { CognitoJwtVerifier } = await import('aws-jwt-verify');
    const verifier = CognitoJwtVerifier.create({ userPoolId, tokenUse: 'id', clientId });
    const payload = await verifier.verify(auth.slice('Bearer '.length));
    return { kind: 'user', id: String(payload.sub), nombre: String(payload.name ?? 'Alguien') };
  } catch {
    return null;
  }
}

/**
 * Resuelve la identidad del que llama en rutas públicas: JWT si vino, si no
 * el header `x-wishy-guest: <guestId>.<secret>` verificado contra la tabla.
 */
export async function resolveViewer(event: ApiEvent): Promise<Viewer | null> {
  const jwt = jwtIdentity(event);
  if (jwt) return { kind: 'user', id: jwt.sub, nombre: jwt.nombre };
  const bearer = await verifyBearer(event);
  if (bearer) return bearer;
  const header = event.headers?.['x-wishy-guest'];
  if (!header) return null;
  const dot = header.indexOf('.');
  if (dot <= 0) return null;
  const guestId = header.slice(0, dot);
  const secret = header.slice(dot + 1);
  const guest = await getGuest(guestId);
  if (!guest || guest.secret !== secret) return null;
  return { kind: 'guest', id: guest.guestId, nombre: guest.nombre };
}
