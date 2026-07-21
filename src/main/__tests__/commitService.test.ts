import { existsSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import { clean, cleanPreview, commit, discardFile, getStatus, stageFile } from '../commitService'

describe('commitService', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
    fx.commit('base', { 'f.txt': 'v1\n' })
  })
  afterEach(() => fx.cleanup())

  describe('getStatus', () => {
    it('clasifica untracked, modificado y preparado', async () => {
      fx.write('nuevo.txt', 'n\n')
      fx.write('f.txt', 'v2\n')
      fx.git('add', 'f.txt')

      const { data, error } = await getStatus(fx.dir)
      expect(error).toBeNull()
      const byPath = Object.fromEntries(data.map((f) => [f.path, f]))
      expect(byPath['nuevo.txt'].untracked).toBe(true)
      expect(byPath['nuevo.txt'].unstaged).toBe(true)
      expect(byPath['f.txt'].staged).toBe(true)
    })

    it('en una carpeta que no es repo reporta el error, no "sin cambios"', async () => {
      const r = await getStatus(fx.dir + '-inexistente')
      expect(r.data).toEqual([])
      expect(r.error).not.toBeNull()
    })
  })

  describe('commit', () => {
    it('conserva un mensaje multilinea (va por stdin)', async () => {
      fx.write('f.txt', 'v2\n')
      await stageFile(fx.dir, 'f.txt')
      const res = await commit(fx.dir, 'feat: titulo\n\ncuerpo con detalle\ny otra linea')
      expect(res.ok).toBe(true)
      const msg = fx.git('log', '-1', '--pretty=%B')
      expect(msg).toContain('feat: titulo')
      expect(msg).toContain('cuerpo con detalle\ny otra linea')
    })

    it('amend sin mensaje conserva el anterior', async () => {
      fx.write('f.txt', 'v2\n')
      await stageFile(fx.dir, 'f.txt')
      const res = await commit(fx.dir, '', true)
      expect(res.ok).toBe(true)
      expect(fx.git('log', '-1', '--pretty=%s').trim()).toBe('base')
      // sigue habiendo UN solo commit (se reescribio, no se agrego)
      expect(fx.git('rev-list', '--count', 'HEAD').trim()).toBe('1')
    })
  })

  describe('discardFile', () => {
    it('un archivo trackeado vuelve a su contenido anterior', async () => {
      fx.write('f.txt', 'roto\n')
      const res = await discardFile(fx.dir, 'f.txt')
      expect(res.ok).toBe(true)
      expect(fx.git('status', '--porcelain').trim()).toBe('')
    })

    it('un archivo untracked se BORRA del disco (clean -f)', async () => {
      fx.write('basura.txt', 'x\n')
      const res = await discardFile(fx.dir, 'basura.txt', true)
      expect(res.ok).toBe(true)
      expect(existsSync(join(fx.dir, 'basura.txt'))).toBe(false)
    })

    it('no toca los demas archivos', async () => {
      fx.write('f.txt', 'roto\n')
      fx.write('otro.txt', 'se queda\n')
      await discardFile(fx.dir, 'f.txt')
      expect(existsSync(join(fx.dir, 'otro.txt'))).toBe(true)
    })
  })

  describe('clean', () => {
    it('el dry-run lista lo que se borraria SIN borrar nada', async () => {
      fx.write('basura.txt', 'x\n')
      const res = await cleanPreview(fx.dir)
      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('basura.txt')
      expect(existsSync(join(fx.dir, 'basura.txt'))).toBe(true)
    })

    it('clean borra los untracked pero no lo trackeado', async () => {
      fx.write('basura.txt', 'x\n')
      const res = await clean(fx.dir)
      expect(res.ok).toBe(true)
      expect(existsSync(join(fx.dir, 'basura.txt'))).toBe(false)
      expect(existsSync(join(fx.dir, 'f.txt'))).toBe(true)
    })

    it('los ignorados solo caen con includeIgnored (-x)', async () => {
      fx.commit('ignora', { '.gitignore': '*.log\n' })
      fx.write('debug.log', 'x\n')

      await clean(fx.dir)
      expect(existsSync(join(fx.dir, 'debug.log'))).toBe(true)

      await clean(fx.dir, true)
      expect(existsSync(join(fx.dir, 'debug.log'))).toBe(false)
    })
  })
})
