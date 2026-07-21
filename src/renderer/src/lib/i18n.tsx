import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { MESSAGES } from './messages'
import type { MessageKey } from './messages'

export type Lang = 'es' | 'en'

const KEY = 'gitdeck.lang'

/**
 * Idioma guardado, o el del sistema si nunca se eligio uno.
 * Igual que el tema, es preferencia de la vista: vive en localStorage.
 */
export function initialLang(): Lang {
  const saved = localStorage.getItem(KEY)
  if (saved === 'es' || saved === 'en') return saved
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/** Rellena placeholders {nombre} con los parametros dados. */
function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m
  )
}

interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  /** traduce una clave del diccionario (tipada: una clave inexistente no compila) */
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Lang>(initialLang)

  // el lang del documento sigue al idioma elegido (pronunciacion del lector de pantalla)
  useEffect(() => {
    document.documentElement.lang = lang
    localStorage.setItem(KEY, lang)
  }, [lang])

  const setLang = useCallback((l: Lang) => setLangState(l), [])

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) =>
      format(MESSAGES[lang][key], params),
    [lang]
  )

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>')
  return ctx
}
