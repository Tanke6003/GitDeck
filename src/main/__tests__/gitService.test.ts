import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import {
  getBranches,
  getCommitDetail,
  getCommits,
  getMergePreview,
  getRemotes,
  searchCommits
} from '../gitService'

describe('gitService', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
  })
  afterEach(() => fx.cleanup())

  describe('getCommits', () => {
    it('lee el log con padres, autor y refs', async () => {
      fx.commit('primero', { 'a.txt': 'a\n' })
      fx.commit('segundo', { 'b.txt': 'b\n' })

      const commits = await getCommits(fx.dir)
      expect(commits).toHaveLength(2)
      // newest-first
      expect(commits[0].subject).toBe('segundo')
      expect(commits[1].subject).toBe('primero')
      expect(commits[0].author).toBe('Test User')
      expect(commits[0].parents).toEqual([commits[1].hash])
      // el commit raiz no tiene padres
      expect(commits[1].parents).toEqual([])
      expect(commits[0].refs.join(' ')).toContain('main')
      expect(commits[0].timestamp).toBeGreaterThan(0)
    })

    it('incluye las ramas que no son HEAD (--all)', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('switch', '-qc', 'otra')
      fx.commit('en otra', { 'c.txt': 'c\n' })
      fx.git('switch', '-q', 'main')

      const subjects = (await getCommits(fx.dir)).map((c) => c.subject)
      expect(subjects).toContain('en otra')
    })

    it('un merge reporta sus dos padres', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('switch', '-qc', 'rama')
      fx.commit('en rama', { 'b.txt': 'b\n' })
      fx.git('switch', '-q', 'main')
      fx.commit('en main', { 'c.txt': 'c\n' })
      fx.git('merge', '--no-ff', '-m', 'merge rama', 'rama')

      const merge = (await getCommits(fx.dir)).find((c) => c.subject === 'merge rama')
      expect(merge!.parents).toHaveLength(2)
    })

    it('respeta el limite', async () => {
      fx.commit('uno', { 'a.txt': '1' })
      fx.commit('dos', { 'a.txt': '2' })
      fx.commit('tres', { 'a.txt': '3' })
      expect(await getCommits(fx.dir, 2)).toHaveLength(2)
    })

    it('un repo recien creado (sin commits) da lista vacia, no revienta', async () => {
      expect(await getCommits(fx.dir)).toEqual([])
    })
  })

  describe('getBranches', () => {
    it('marca la rama actual y no confunde locales con remotas', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('branch', 'otra')

      const branches = await getBranches(fx.dir)
      const main = branches.find((b) => b.name === 'main')!
      const otra = branches.find((b) => b.name === 'otra')!

      expect(main.isCurrent).toBe(true)
      expect(otra.isCurrent).toBe(false)
      expect(main.isRemote).toBe(false)
      expect(main.subject).toBe('base')
      // sin upstream no hay adelanto ni atraso que reportar
      expect(main.upstream).toBeNull()
      expect(main.ahead).toBe(0)
      expect(main.behind).toBe(0)
      expect(main.gone).toBe(false)
    })

    it('cuenta ahead/behind contra el upstream', async () => {
      const origin = new Fixture()
      try {
        origin.commit('base', { 'a.txt': 'a\n' })
        fx.git('remote', 'add', 'origin', origin.dir)
        fx.git('fetch', '-q', 'origin')
        fx.git('switch', '-q', '-c', 'main2', '--track', 'origin/main')

        fx.commit('local uno', { 'b.txt': 'b\n' })
        fx.commit('local dos', { 'c.txt': 'c\n' })

        const b = (await getBranches(fx.dir)).find((x) => x.name === 'main2')!
        expect(b.upstream).toBe('origin/main')
        expect(b.ahead).toBe(2)
        expect(b.behind).toBe(0)
        expect(b.gone).toBe(false)
      } finally {
        origin.cleanup()
      }
    })

    it('detecta el upstream desaparecido (gone)', async () => {
      const origin = new Fixture()
      try {
        origin.commit('base', { 'a.txt': 'a\n' })
        origin.git('branch', 'temporal')
        fx.git('remote', 'add', 'origin', origin.dir)
        fx.git('fetch', '-q', 'origin')
        fx.git('switch', '-q', '-c', 'temporal', '--track', 'origin/temporal')

        // la rama desaparece del remoto
        origin.git('branch', '-D', 'temporal')
        fx.git('fetch', '-q', '--prune', 'origin')

        const b = (await getBranches(fx.dir)).find((x) => x.name === 'temporal')!
        expect(b.gone).toBe(true)
      } finally {
        origin.cleanup()
      }
    })
  })

  describe('getRemotes', () => {
    it('junta las urls de fetch y push en una sola entrada', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('remote', 'add', 'origin', 'https://example.com/uno.git')
      fx.git('remote', 'add', 'hub', 'https://example.com/dos.git')
      fx.git('remote', 'set-url', '--push', 'origin', 'https://example.com/push.git')

      const remotes = await getRemotes(fx.dir)
      expect(remotes).toHaveLength(2)
      const origin = remotes.find((r) => r.name === 'origin')!
      expect(origin.fetchUrl).toBe('https://example.com/uno.git')
      expect(origin.pushUrl).toBe('https://example.com/push.git')
    })

    it('sin remotos devuelve lista vacia', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      expect(await getRemotes(fx.dir)).toEqual([])
    })
  })

  describe('getCommitDetail', () => {
    it('trae metadatos, archivos con estado y diff', async () => {
      fx.commit('base', { 'a.txt': 'a\n', 'viejo.txt': 'x\n' })
      fx.write('a.txt', 'a modificada\n')
      fx.write('nuevo.txt', 'n\n')
      fx.git('rm', '-q', 'viejo.txt')
      const sha = fx.commit('feat: varios cambios')

      const d = await getCommitDetail(fx.dir, sha)
      expect(d.subject).toBe('feat: varios cambios')
      expect(d.author).toBe('Test User')

      const byPath = Object.fromEntries(d.files.map((f) => [f.path, f.status]))
      expect(byPath['a.txt']).toBe('M')
      expect(byPath['nuevo.txt']).toBe('A')
      expect(byPath['viejo.txt']).toBe('D')
      expect(d.diff).toContain('a modificada')
    })
  })

  describe('getMergePreview', () => {
    it('detecta fast-forward y lista lo que entraria', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('switch', '-qc', 'rama')
      fx.commit('feat: uno', { 'b.txt': 'b\n' })
      fx.commit('feat: dos', { 'c.txt': 'c\n' })
      fx.git('switch', '-q', 'main')

      const p = await getMergePreview(fx.dir, 'rama')
      expect(p.error).toBeNull()
      expect(p.fastForward).toBe(true)
      expect(p.upToDate).toBe(false)
      expect(p.commits.map((c) => c.subject)).toEqual(['feat: dos', 'feat: uno'])
      expect(p.stat).toContain('b.txt')
      expect(p.stat).toContain('c.txt')
    })

    it('marca merge real cuando las ramas divergen', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('switch', '-qc', 'rama')
      fx.commit('en rama', { 'b.txt': 'b\n' })
      fx.git('switch', '-q', 'main')
      fx.commit('en main', { 'c.txt': 'c\n' })

      const p = await getMergePreview(fx.dir, 'rama')
      expect(p.fastForward).toBe(false)
      expect(p.commits).toHaveLength(1)
      // 3 puntos: solo lo de la otra rama, no lo propio
      expect(p.stat).toContain('b.txt')
      expect(p.stat).not.toContain('c.txt')
    })

    it('upToDate cuando ya esta fusionada', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      fx.git('branch', 'igual')

      const p = await getMergePreview(fx.dir, 'igual')
      expect(p.upToDate).toBe(true)
      expect(p.commits).toEqual([])
    })

    it('una rama inexistente da error controlado, no excepcion', async () => {
      fx.commit('base', { 'a.txt': 'a\n' })
      const p = await getMergePreview(fx.dir, 'no-existe')
      expect(p.error).toBeTruthy()
      expect(p.commits).toEqual([])
    })
  })

  describe('searchCommits', () => {
    beforeEach(() => {
      fx.as('Ana Lopez', 'ana@x.com')
      fx.commit('feat: agregar saludo', { 'app.js': 'hola mundo\n' })
      fx.as('Bob Ruiz', 'bob@x.com')
      fx.commit('fix: corregir despedida', { 'app.js': 'hola mundo\nadios\n' })
      fx.commit('chore: helper', { 'src/utils/helper.ts': 'export const x = 1\n' })
    })

    it('busca por mensaje sin distinguir mayusculas', async () => {
      const r = await searchCommits(fx.dir, 'message', 'CORREGIR')
      expect(r.map((c) => c.subject)).toEqual(['fix: corregir despedida'])
    })

    it('busca por autor', async () => {
      const r = await searchCommits(fx.dir, 'author', 'ana')
      expect(r.map((c) => c.subject)).toEqual(['feat: agregar saludo'])
    })

    it('busca por contenido con el pickaxe', async () => {
      const r = await searchCommits(fx.dir, 'content', 'hola')
      expect(r.map((c) => c.subject)).toEqual(['feat: agregar saludo'])
    })

    it('busca por ruta de archivo', async () => {
      const r = await searchCommits(fx.dir, 'file', 'helper')
      expect(r.map((c) => c.subject)).toEqual(['chore: helper'])
    })

    it('busca por revision', async () => {
      const r = await searchCommits(fx.dir, 'hash', 'HEAD~1')
      expect(r).toHaveLength(1)
      expect(r[0].subject).toBe('fix: corregir despedida')
    })

    it('una revision inexistente da lista vacia en vez de reventar', async () => {
      expect(await searchCommits(fx.dir, 'hash', 'no-existe-jamas')).toEqual([])
    })

    it('texto vacio no busca nada', async () => {
      expect(await searchCommits(fx.dir, 'message', '   ')).toEqual([])
    })

    it('el texto del usuario no se interpreta como shell', async () => {
      // si esto se colara a una shell, el repo se romperia
      const r = await searchCommits(fx.dir, 'message', '"; rm -rf . #')
      expect(r).toEqual([])
      // el repo sigue entero
      expect(await getCommits(fx.dir)).toHaveLength(3)
    })
  })
})
