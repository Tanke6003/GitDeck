import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import { getRepoInfo } from '../repoService'

describe('repoService.getRepoInfo (status --porcelain=v2 --branch)', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
  })
  afterEach(() => fx.cleanup())

  it('lee rama, head y limpio de una sola pasada', async () => {
    const sha = fx.commit('base', { 'a.txt': 'a\n' })
    const info = await getRepoInfo(fx.dir)
    expect(info.valid).toBe(true)
    expect(info.currentBranch).toBe('main')
    expect(info.head).toBe(sha)
    expect(info.dirty).toBe(false)
  })

  it('marca dirty con cualquier cambio (incluido untracked)', async () => {
    fx.commit('base', { 'a.txt': 'a\n' })
    fx.write('nuevo.txt', 'n\n')
    expect((await getRepoInfo(fx.dir)).dirty).toBe(true)
  })

  it('HEAD detached reporta rama null', async () => {
    fx.commit('uno', { 'a.txt': '1' })
    const sha = fx.commit('dos', { 'a.txt': '2' })
    fx.git('checkout', '-q', '--detach', 'HEAD~1')

    const info = await getRepoInfo(fx.dir)
    expect(info.currentBranch).toBeNull()
    expect(info.head).not.toBe(sha) // apunta al commit anterior
    expect(info.valid).toBe(true)
  })

  it('un repo sin commits reporta head null pero rama valida', async () => {
    const info = await getRepoInfo(fx.dir)
    expect(info.valid).toBe(true)
    expect(info.currentBranch).toBe('main')
    expect(info.head).toBeNull()
  })

  it('una carpeta que no es repo queda valid:false con el error', async () => {
    const info = await getRepoInfo(fx.dir + '-no-repo')
    expect(info.valid).toBe(false)
    expect(info.error).toBeTruthy()
  })
})
