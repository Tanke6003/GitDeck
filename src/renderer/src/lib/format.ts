import type { Lang } from './i18n'

/*
 * Cada entrada es [segundos de la unidad, etiqueta es|en]: abs/segundos da la
 * cantidad EN ESA unidad. (La version anterior tenia las etiquetas corridas
 * una posicion: 3 horas salia como "hace 3 min".)
 */
const UNITS: [number, string][] = [
  [60, 'min|min'],
  [3600, 'h|h'],
  [86400, 'd|d'],
  [604800, 'sem|wk'],
  [2629800, 'mes|mo'],
  [31557600, 'año|yr']
]

/** Tiempo relativo compacto ("hace 3 h" / "3 h ago") desde un timestamp unix (segundos). */
export function relativeTime(unixSeconds: number, lang: Lang = 'es'): string {
  if (!unixSeconds) return ''
  const diff = Date.now() / 1000 - unixSeconds
  const abs = Math.abs(diff)
  if (abs < 60) return lang === 'es' ? 'ahora' : 'now'
  for (let i = UNITS.length - 1; i >= 0; i--) {
    const [secs, labels] = UNITS[i]
    if (abs >= secs) {
      const n = Math.floor(abs / secs)
      const label = labels.split('|')[lang === 'es' ? 0 : 1]
      return lang === 'es' ? `hace ${n} ${label}` : `${n} ${label} ago`
    }
  }
  return lang === 'es' ? 'ahora' : 'now'
}

export type RefKind = 'head' | 'local' | 'remote' | 'tag'

export interface ParsedRef {
  kind: RefKind
  label: string
}

/**
 * Convierte una entrada de %D (ej. "HEAD -> main", "origin/main", "tag: v1")
 * en un chip clasificado para pintar.
 *
 * `remotes` son los nombres de remotos conocidos del repo: una ref es remota
 * solo si su primer segmento coincide con uno de ellos. Sin esta lista, una
 * rama local jerarquica ("feature/login") se confundiria con una remota por el
 * simple hecho de contener "/".
 */
export function parseRef(raw: string, remotes: readonly string[] = []): ParsedRef {
  const ref = raw.trim()
  if (ref.startsWith('tag:')) return { kind: 'tag', label: ref.replace('tag:', '').trim() }
  if (ref.startsWith('HEAD ->')) return { kind: 'head', label: ref.replace('HEAD ->', '').trim() }
  if (ref === 'HEAD') return { kind: 'head', label: 'HEAD' }
  const first = ref.split('/', 1)[0]
  if (remotes.includes(first)) return { kind: 'remote', label: ref }
  return { kind: 'local', label: ref }
}
