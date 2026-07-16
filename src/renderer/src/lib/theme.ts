export type Theme = 'dark' | 'light'

const KEY = 'gitdeck.theme'

/**
 * Tema guardado, o el del sistema si nunca se eligio uno.
 *
 * Se lee de localStorage (no de userData): es una preferencia de la vista, no
 * un dato del que dependa el proceso principal.
 */
export function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Aplica el tema al <html> y lo recuerda. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(KEY, theme)
}
