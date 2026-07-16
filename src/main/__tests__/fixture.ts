import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

/**
 * Un repo git de verdad, creado al vuelo en una carpeta temporal.
 *
 * Los tests corren contra el binario `git` real (igual que la app) en vez de
 * simular su salida: lo que se quiere comprobar es justamente que los parseos
 * aguantan lo que git escribe de verdad.
 */
export class Fixture {
  readonly dir: string

  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), 'gitdeck-test-'))
    this.git('init', '-q', '-b', 'main')
    this.git('config', 'user.email', 'test@gitdeck.dev')
    this.git('config', 'user.name', 'Test User')
    // sin esto Windows reescribe los saltos de linea y los diffs no cuadran
    this.git('config', 'core.autocrlf', 'false')
  }

  /** Corre git en el repo y devuelve stdout. Lanza si git falla. */
  git(...args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.dir,
      encoding: 'utf-8',
      env: { ...process.env, LC_ALL: 'C.UTF-8' }
    })
  }

  /** Escribe un archivo (creando carpetas si hace falta). */
  write(path: string, content: string): void {
    const full = join(this.dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf-8')
  }

  /** write + add + commit en un paso. Devuelve el sha corto. */
  commit(message: string, files: Record<string, string> = {}): string {
    for (const [path, content] of Object.entries(files)) this.write(path, content)
    this.git('add', '-A')
    this.git('commit', '-q', '-m', message)
    return this.git('rev-parse', '--short', 'HEAD').trim()
  }

  /** Autor distinto para el siguiente commit. */
  as(name: string, email: string): void {
    this.git('config', 'user.name', name)
    this.git('config', 'user.email', email)
  }

  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true })
  }
}
