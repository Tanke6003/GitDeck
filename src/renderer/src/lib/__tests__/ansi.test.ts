import { describe, expect, it } from 'vitest'
import { ansiToHtml } from '../ansi'

describe('ansiToHtml', () => {
  it('escapa el HTML del texto (la base de que dangerouslySetInnerHTML sea seguro)', () => {
    const html = ansiToHtml('<script>alert(1)</script> & <b>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('colorea con variables de tema los 16 colores base', () => {
    const html = ansiToHtml('\x1b[31mrojo\x1b[0m normal \x1b[92mverde-brillante\x1b[0m')
    expect(html).toContain('color:var(--ansi-1)')
    expect(html).toContain('color:var(--ansi-10)')
    expect(html).toContain('rojo')
  })

  it('un reset (0 o vacio) limpia el estado', () => {
    const html = ansiToHtml('\x1b[31mrojo\x1b[mdespues')
    // el texto tras el reset no lleva el color
    const after = html.split('despues')[0].split('rojo')[1]
    expect(after).not.toContain('--ansi-1')
  })

  it('soporta 256 colores y truecolor con el valor literal', () => {
    const c256 = ansiToHtml('\x1b[38;5;196mx\x1b[0m')
    expect(c256).toContain('rgb(255,0,0)')
    const tc = ansiToHtml('\x1b[38;2;1;2;3mx\x1b[0m')
    expect(tc).toContain('rgb(1,2,3)')
  })

  it('la escala de grises de 256 se calcula bien', () => {
    // 232 es el primer gris: 8,8,8
    expect(ansiToHtml('\x1b[38;5;232mx')).toContain('rgb(8,8,8)')
  })

  it('negrita, dim y subrayado se acumulan y 22/24 los apagan', () => {
    const html = ansiToHtml('\x1b[1;4mAAA\x1b[22;24mBBB')
    const [aPart, bPart] = html.split('BBB')
    expect(aPart).toContain('font-weight:700')
    expect(aPart).toContain('underline')
    expect(bPart ?? '').not.toContain('font-weight:700')
  })

  it('el fondo usa 40-47 y 49 lo limpia', () => {
    const html = ansiToHtml('\x1b[41mAAA\x1b[49mBBB')
    expect(html.split('BBB')[0]).toContain('background:var(--ansi-1)')
  })

  it('texto sin codigos pasa tal cual (escapado)', () => {
    expect(ansiToHtml('hola')).toContain('hola')
  })
})
