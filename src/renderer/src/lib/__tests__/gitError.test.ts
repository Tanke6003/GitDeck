import { describe, expect, it } from 'vitest'
import { explainGitError } from '../gitError'
import type { GitResult } from '@shared/types'

const fail = (stderr: string, stdout = ''): GitResult => ({
  ok: false,
  cmd: 'git x',
  stdout,
  stderr,
  code: 1
})

describe('explainGitError', () => {
  it('un resultado ok (o nulo) no produce explicacion', () => {
    expect(explainGitError(null)).toBeNull()
    expect(explainGitError({ ok: true, cmd: 'git x', stdout: '', stderr: '', code: 0 })).toBeNull()
  })

  it('un error desconocido devuelve null (no se inventa nada)', () => {
    expect(explainGitError(fail('algo rarisimo sin patron'))).toBeNull()
  })

  it('reconoce el push rechazado por non-fast-forward', () => {
    const hint = explainGitError(fail('! [rejected] main -> main (non-fast-forward)'))
    expect(hint).not.toBeNull()
    expect(hint!.title.toLowerCase()).toContain('push')
  })

  it('reconoce el index.lock de otra operacion en curso', () => {
    const hint = explainGitError(fail("Unable to create '.git/index.lock': File exists"))
    expect(hint).not.toBeNull()
    expect(hint!.hint).toContain('index.lock')
  })

  it('reconoce los conflictos de merge', () => {
    const hint = explainGitError(fail('', 'CONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed'))
    expect(hint).not.toBeNull()
  })

  it('tambien busca en stdout (git reparte los mensajes entre ambos)', () => {
    const hint = explainGitError(fail('', 'nothing to commit, working tree clean'))
    expect(hint).not.toBeNull()
  })
})
