import { runGit } from './gitRunner'
import type { BlameLine, ReflogEntry } from '@shared/types'

/** separador de campos poco probable en el contenido (unit separator) */
const SEP = '\x1f'

/** cabecera de bloque del porcelain: "<sha40> <lineaOrig> <lineaFinal> [<n>]" */
const HEADER = /^([0-9a-f]{40}) \d+ (\d+)/

/**
 * `git blame` de un archivo: quien escribio cada linea.
 *
 * Se usa `--line-porcelain` (no `-p`) porque repite la cabecera en CADA linea:
 * con `-p` git omite los datos del commit cuando se repite, y habria que
 * arrastrar el ultimo visto. Sale mas verboso pero el parseo no puede
 * desincronizarse.
 *
 * @param rev revision opcional: blame del archivo tal como estaba en ese commit.
 */
export async function getBlame(repo: string, path: string, rev?: string): Promise<BlameLine[]> {
  const args = ['blame', '--line-porcelain']
  if (rev && rev.trim()) args.push(rev.trim())
  args.push('--', path)

  const res = await runGit(args, repo)
  if (!res.ok) return []

  const out: BlameLine[] = []
  let cur: Partial<BlameLine> = {}

  for (const line of res.stdout.split('\n')) {
    const h = HEADER.exec(line)
    if (h) {
      cur = { hash: h[1], short: h[1].slice(0, 7), line: Number(h[2]) }
      continue
    }
    if (line.startsWith('author ')) {
      cur.author = line.slice(7)
      continue
    }
    if (line.startsWith('author-time ')) {
      cur.timestamp = Number(line.slice(12)) || 0
      continue
    }
    if (line.startsWith('summary ')) {
      cur.subject = line.slice(8)
      continue
    }
    // el contenido de la linea es lo unico que va con TAB delante
    if (line.startsWith('\t')) {
      out.push({
        hash: cur.hash ?? '',
        short: cur.short ?? '',
        author: cur.author ?? '',
        timestamp: cur.timestamp ?? 0,
        subject: cur.subject ?? '',
        line: cur.line ?? out.length + 1,
        content: line.slice(1)
      })
      cur = {}
    }
  }
  return out
}

/**
 * `git reflog`: por donde ha pasado HEAD. Sirve para recuperar commits que
 * quedaron sin rama (tras un reset, un rebase o un checkout).
 */
export async function getReflog(repo: string, limit = 200): Promise<ReflogEntry[]> {
  const fmt = ['%gd', '%h', '%gs', '%cr', '%s'].join(SEP)
  const res = await runGit(['reflog', `--max-count=${limit}`, `--format=${fmt}`], repo)
  if (!res.ok) return []

  const out: ReflogEntry[] = []
  for (const line of res.stdout.split('\n')) {
    if (!line.trim()) continue
    const [ref, short, action, date, subject] = line.split(SEP)
    out.push({
      ref: ref ?? '',
      short: short ?? '',
      action: action ?? '',
      date: date ?? '',
      subject: subject ?? ''
    })
  }
  return out
}
