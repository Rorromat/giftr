import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '@/db'
import { mandarRecordatorios } from '@/lib/recordatorios'

// El cron de todos los días (ver vercel.json: 12:00 UTC, las 9 de la mañana en Argentina): estira las reservas que vencían
// en la víspera de un cumple y manda los recordatorios (ver recordatorios.ts). Vercel lo llama con
// "Authorization: Bearer <CRON_SECRET>": sin esa variable configurada, o con otro valor, no hace nada. Si no, cualquiera
// que conozca la dirección les haría sonar el celular a todos.

/** Cada aviso espera a los servicios de push: con muchos, los segundos de siempre no alcanzan. */
export const maxDuration = 60

const huella = (s: string) => createHash('sha256').update(s).digest()

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET
  const llego = request.headers.get('authorization') ?? ''
  // se comparan las huellas, que miden lo mismo: lo que tarda no dice cuánto del secreto se acertó
  if (!secreto || !timingSafeEqual(huella(llego), huella(`Bearer ${secreto}`))) {
    return Response.json({ error: 'no_autorizado' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  }
  const r = await mandarRecordatorios(db)
  // con algo que falló, 500: así se ve en los logs del cron (lo demás salió igual, y mañana no se repite)
  return Response.json(r, { status: r.fallaron.length ? 500 : 200, headers: { 'cache-control': 'no-store' } })
}
