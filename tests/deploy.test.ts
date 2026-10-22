import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// El build de Vercel tal cual está en package.json, con next y drizzle-kit de mentira que anotan lo que se les pidió.
const VERCEL_BUILD: string = JSON.parse(readFileSync('package.json', 'utf8')).scripts['vercel-build']

function build(vercelEnv: string | undefined, { compila = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'giftr-build-'))
  try {
    const log = join(dir, 'pasos')
    writeFileSync(join(dir, 'next'), `#!/bin/sh\necho "next $*" >> "${log}"\nexit ${compila ? 0 : 1}\n`)
    writeFileSync(join(dir, 'drizzle-kit'), `#!/bin/sh\necho "drizzle-kit $*" >> "${log}"\n`)
    chmodSync(join(dir, 'next'), 0o755)
    chmodSync(join(dir, 'drizzle-kit'), 0o755)
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', PATH: `${dir}:${process.env.PATH}`, ...(vercelEnv && { VERCEL_ENV: vercelEnv }) }
    let ok = true
    try {
      execFileSync('sh', ['-c', VERCEL_BUILD], { env, stdio: 'ignore' })
    } catch {
      ok = false
    }
    return { ok, pasos: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('el deploy a producción migra la base después de compilar', () => {
  expect(build('production')).toEqual({ ok: true, pasos: ['next build', 'drizzle-kit migrate'] })
})

test('un preview no migra: la base es la de producción y main sigue con el código de antes', () => {
  expect(build('preview')).toEqual({ ok: true, pasos: ['next build'] })
  expect(build(undefined)).toEqual({ ok: true, pasos: ['next build'] })
})

test('si no compila, no migra: el deploy de antes sigue sirviendo con la base que conoce', () => {
  expect(build('production', { compila: false })).toEqual({ ok: false, pasos: ['next build'] })
})
