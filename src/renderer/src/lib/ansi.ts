/**
 * Convierte texto con codigos ANSI SGR (los que emite git con color.ui=always)
 * a HTML seguro: spans con estilos inline. Maneja negrita/dim/subrayado,
 * colores 16, 256 y truecolor. El texto se escapa antes de inyectarse.
 */

/*
 * Los 16 colores base salen de variables CSS (--ansi-0..15) en vez de hex fijos,
 * asi el rojo/verde de un diff sigue al tema: los tonos pensados para fondo
 * oscuro no se leen sobre fondo claro. Los valores estan en assets/main.css.
 *
 * Los colores de 256 y truecolor SI van literales: ahi el programa pidio un
 * color exacto, y no hay a que mapearlo.
 */
const STD = Array.from({ length: 8 }, (_, i) => `var(--ansi-${i})`)
const BRIGHT = Array.from({ length: 8 }, (_, i) => `var(--ansi-${i + 8})`)

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface State {
  fg: string | null
  bg: string | null
  bold: boolean
  dim: boolean
  underline: boolean
}
const fresh = (): State => ({ fg: null, bg: null, bold: false, dim: false, underline: false })

function styleOf(s: State): string {
  const p: string[] = []
  if (s.fg) p.push(`color:${s.fg}`)
  if (s.bg) p.push(`background:${s.bg}`)
  if (s.bold) p.push('font-weight:700')
  if (s.dim) p.push('opacity:.7')
  if (s.underline) p.push('text-decoration:underline')
  return p.join(';')
}

function xterm256(n: number): string {
  if (n < 8) return STD[n]
  if (n < 16) return BRIGHT[n - 8]
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return `rgb(${v},${v},${v})`
  }
  const i = n - 16
  const conv = (x: number): number => (x === 0 ? 0 : 55 + x * 40)
  return `rgb(${conv(Math.floor(i / 36))},${conv(Math.floor((i % 36) / 6))},${conv(i % 6)})`
}

function apply(state: State, codes: number[]): void {
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c === 0) Object.assign(state, fresh())
    else if (c === 1) state.bold = true
    else if (c === 2) state.dim = true
    else if (c === 4) state.underline = true
    else if (c === 22) {
      state.bold = false
      state.dim = false
    } else if (c === 24) state.underline = false
    else if (c >= 30 && c <= 37) state.fg = STD[c - 30]
    else if (c >= 90 && c <= 97) state.fg = BRIGHT[c - 90]
    else if (c === 39) state.fg = null
    else if (c >= 40 && c <= 47) state.bg = STD[c - 40]
    else if (c >= 100 && c <= 107) state.bg = BRIGHT[c - 100]
    else if (c === 49) state.bg = null
    else if (c === 38 || c === 48) {
      const key = c === 38 ? 'fg' : 'bg'
      if (codes[i + 1] === 5) {
        state[key] = xterm256(codes[i + 2])
        i += 2
      } else if (codes[i + 1] === 2) {
        state[key] = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
        i += 4
      }
    }
  }
}

export function ansiToHtml(input: string): string {
  // el ESC (\x1b) es justo lo que abre una secuencia SGR; no es un control accidental
  // eslint-disable-next-line no-control-regex
  const re = /\x1b\[([0-9;]*)m/g
  const state = fresh()
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    const text = input.slice(last, m.index)
    if (text) out += `<span style="${styleOf(state)}">${esc(text)}</span>`
    const codes = m[1] === '' ? [0] : m[1].split(';').map(Number)
    apply(state, codes)
    last = re.lastIndex
  }
  const rest = input.slice(last)
  if (rest) out += `<span style="${styleOf(state)}">${esc(rest)}</span>`
  return out
}
