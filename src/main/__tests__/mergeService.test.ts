import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import { abortOp, cherryPick, continueOp, getRepoState, merge, rebase, revert } from '../mergeService'

/** deja main y `otra` tocando la MISMA linea, para forzar conflicto */
function divergir(fx: Fixture): string {
  fx.commit('base', { 'f.txt': 'base\n' })
  fx.git('switch', '-qc', 'otra')
  fx.commit('cambio en otra', { 'f.txt': 'otra\n' })
  const sha = fx.git('rev-parse', '--short', 'HEAD').trim()
  fx.git('switch', '-q', 'main')
  fx.commit('cambio en main', { 'f.txt': 'main\n' })
  return sha
}

describe('mergeService', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
  })
  afterEach(() => fx.cleanup())

  describe('getRepoState', () => {
    it('un repo tranquilo no reporta operacion ni conflictos', async () => {
      fx.commit('base', { 'f.txt': 'x\n' })
      const st = await getRepoState(fx.dir)
      expect(st.op).toBeNull()
      expect(st.conflicted).toEqual([])
    })

    it('detecta el merge en curso y sus conflictos', async () => {
      divergir(fx)
      await merge(fx.dir, 'otra')

      const st = await getRepoState(fx.dir)
      expect(st.op).toBe('merge')
      expect(st.conflicted).toEqual(['f.txt'])
    })

    it('detecta el rebase en curso', async () => {
      divergir(fx)
      await rebase(fx.dir, 'otra')

      const st = await getRepoState(fx.dir)
      // clave: el rebase usa cherry-pick por dentro; aun asi lo que hay que
      // continuar es el rebase, no un cherry-pick
      expect(st.op).toBe('rebase')
      expect(st.conflicted).toEqual(['f.txt'])
    })

    it('detecta el cherry-pick en curso', async () => {
      const sha = divergir(fx)
      await cherryPick(fx.dir, sha)

      const st = await getRepoState(fx.dir)
      expect(st.op).toBe('cherry-pick')
      expect(st.conflicted).toEqual(['f.txt'])
    })

    it('detecta el revert en curso', async () => {
      const sha = divergir(fx)
      await revert(fx.dir, sha)

      const st = await getRepoState(fx.dir)
      expect(st.op).toBe('revert')
    })
  })

  describe('cherryPick', () => {
    it('aplica el commit y deja el rastro de -x', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('switch', '-qc', 'otra')
      const sha = fx.commit('feat: algo util', { 'b.txt': 'b\n' })
      fx.git('switch', '-q', 'main')

      const res = await cherryPick(fx.dir, sha)
      expect(res.ok).toBe(true)

      const msg = fx.git('log', '-1', '--format=%s%n%b')
      expect(msg).toContain('feat: algo util')
      expect(msg).toContain('cherry picked from commit')
      expect(await getRepoState(fx.dir)).toMatchObject({ op: null })
    })
  })

  describe('revert', () => {
    it('crea un commit que deshace, sin borrar el original', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      const sha = fx.commit('feat: agrega b', { 'b.txt': 'b\n' })

      const res = await revert(fx.dir, sha)
      expect(res.ok).toBe(true)
      expect(fx.git('log', '-1', '--format=%s')).toContain('Revert')
      // el original sigue en la historia
      expect(fx.git('log', '--format=%h')).toContain(sha)
      // y el archivo revertido ya no esta
      expect(fx.git('ls-files')).not.toContain('b.txt')
    })
  })

  describe('continueOp / abortOp', () => {
    it('termina un cherry-pick tras resolver el conflicto', async () => {
      const sha = divergir(fx)
      await cherryPick(fx.dir, sha)

      fx.write('f.txt', 'resuelto\n')
      fx.git('add', 'f.txt')

      // sin GIT_EDITOR=true git abriria un editor y esto se colgaria
      const res = await continueOp(fx.dir, 'cherry-pick')
      expect(res.ok).toBe(true)
      expect(await getRepoState(fx.dir)).toMatchObject({ op: null, conflicted: [] })
    })

    it('termina un merge tras resolver', async () => {
      divergir(fx)
      await merge(fx.dir, 'otra')

      fx.write('f.txt', 'resuelto\n')
      fx.git('add', 'f.txt')

      const res = await continueOp(fx.dir, 'merge')
      expect(res.ok).toBe(true)
      expect(await getRepoState(fx.dir)).toMatchObject({ op: null })
      // el merge deja un commit con dos padres
      expect(fx.git('rev-list', '--parents', '-1', 'HEAD').trim().split(' ')).toHaveLength(3)
    })

    it('abortar deja el repo como estaba', async () => {
      divergir(fx)
      const antes = fx.git('rev-parse', 'HEAD').trim()
      await merge(fx.dir, 'otra')
      expect((await getRepoState(fx.dir)).op).toBe('merge')

      const res = await abortOp(fx.dir, 'merge')
      expect(res.ok).toBe(true)
      expect(await getRepoState(fx.dir)).toMatchObject({ op: null, conflicted: [] })
      expect(fx.git('rev-parse', 'HEAD').trim()).toBe(antes)
      expect(fx.git('show', 'HEAD:f.txt')).toContain('main')
    })

    it('abortar un rebase devuelve la rama a su sitio', async () => {
      divergir(fx)
      const antes = fx.git('rev-parse', 'HEAD').trim()
      await rebase(fx.dir, 'otra')
      expect((await getRepoState(fx.dir)).op).toBe('rebase')

      await abortOp(fx.dir, 'rebase')
      expect((await getRepoState(fx.dir)).op).toBeNull()
      expect(fx.git('rev-parse', 'HEAD').trim()).toBe(antes)
    })
  })
})
