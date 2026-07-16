/** Tiempo relativo compacto en español a partir de un timestamp unix (segundos). */
export function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return ''
  const diff = Date.now() / 1000 - unixSeconds
  const abs = Math.abs(diff)
  const units: [number, string][] = [
    [60, 'seg'],
    [3600, 'min'],
    [86400, 'h'],
    [604800, 'd'],
    [2629800, 'sem'],
    [31557600, 'mes']
  ]
  if (abs < 60) return 'ahora'
  for (let i = units.length - 1; i >= 0; i--) {
    const [secs, label] = units[i]
    if (abs >= secs) return `hace ${Math.floor(abs / secs)} ${label}`
  }
  return 'ahora'
}

export type RefKind = 'head' | 'local' | 'remote' | 'tag'

export interface ParsedRef {
  kind: RefKind
  label: string
}

/**
 * Convierte una entrada de %D (ej. "HEAD -> main", "origin/main", "tag: v1")
 * en un chip clasificado para pintar.
 */
export function parseRef(raw: string): ParsedRef {
  const ref = raw.trim()
  if (ref.startsWith('tag:')) return { kind: 'tag', label: ref.replace('tag:', '').trim() }
  if (ref.startsWith('HEAD ->')) return { kind: 'head', label: ref.replace('HEAD ->', '').trim() }
  if (ref === 'HEAD') return { kind: 'head', label: 'HEAD' }
  // remoto si el primer segmento parece un remoto (contiene "/")
  if (ref.includes('/')) return { kind: 'remote', label: ref }
  return { kind: 'local', label: ref }
}
