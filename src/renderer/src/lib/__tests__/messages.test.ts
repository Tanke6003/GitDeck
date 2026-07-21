import { describe, expect, it } from 'vitest'
import { MESSAGES } from '../messages'

/** extrae los placeholders {x} de una plantilla */
const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('diccionario i18n', () => {
  it('es y en tienen exactamente las mismas claves', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.es).sort())
  })

  it('cada traduccion conserva los mismos placeholders', () => {
    for (const key of Object.keys(MESSAGES.es) as (keyof typeof MESSAGES.es)[]) {
      expect(params(MESSAGES.en[key]), `placeholders de "${key}"`).toEqual(params(MESSAGES.es[key]))
    }
  })

  it('ninguna traduccion queda vacia', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const [key, value] of Object.entries(MESSAGES[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('')
      }
    }
  })
})
