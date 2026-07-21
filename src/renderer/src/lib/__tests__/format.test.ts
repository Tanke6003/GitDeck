import { describe, expect, it } from 'vitest'
import { parseRef, relativeTime } from '../format'

describe('parseRef', () => {
  const remotes = ['origin', 'upstream']

  it('clasifica HEAD, locales, remotas y tags', () => {
    expect(parseRef('HEAD -> main', remotes)).toEqual({ kind: 'head', label: 'main' })
    expect(parseRef('HEAD', remotes)).toEqual({ kind: 'head', label: 'HEAD' })
    expect(parseRef('main', remotes)).toEqual({ kind: 'local', label: 'main' })
    expect(parseRef('origin/main', remotes)).toEqual({ kind: 'remote', label: 'origin/main' })
    expect(parseRef('tag: v1.0.0', remotes)).toEqual({ kind: 'tag', label: 'v1.0.0' })
  })

  it('una rama local jerarquica NO se confunde con remota', () => {
    // el bug original: "feature/login" contiene "/" y se pintaba como remota
    expect(parseRef('feature/login', remotes).kind).toBe('local')
    expect(parseRef('release/2.0', remotes).kind).toBe('local')
  })

  it('solo es remota si el primer segmento es un remoto REAL', () => {
    expect(parseRef('upstream/dev', remotes).kind).toBe('remote')
    expect(parseRef('otro/dev', remotes).kind).toBe('local')
    // sin lista de remotos, nada se clasifica como remota
    expect(parseRef('origin/main').kind).toBe('local')
  })
})

describe('relativeTime', () => {
  const now = Date.now() / 1000

  it('timestamp 0 devuelve cadena vacia', () => {
    expect(relativeTime(0)).toBe('')
  })

  it('menos de un minuto es "ahora" / "now"', () => {
    expect(relativeTime(now - 5, 'es')).toBe('ahora')
    expect(relativeTime(now - 5, 'en')).toBe('now')
  })

  it('formatea en el idioma pedido', () => {
    expect(relativeTime(now - 3 * 3600, 'es')).toBe('hace 3 h')
    expect(relativeTime(now - 3 * 3600, 'en')).toBe('3 h ago')
    expect(relativeTime(now - 90, 'es')).toBe('hace 1 min')
    expect(relativeTime(now - 90, 'en')).toBe('1 min ago')
  })

  it('escala a dias, semanas y meses', () => {
    expect(relativeTime(now - 2 * 86400, 'es')).toBe('hace 2 d')
    expect(relativeTime(now - 2 * 604800, 'en')).toBe('2 wk ago')
    expect(relativeTime(now - 3 * 2629800, 'es')).toBe('hace 3 mes')
  })
})
