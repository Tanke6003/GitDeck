import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

interface Props {
  /** id del elemento que da nombre al dialogo (aria-labelledby) */
  labelledBy?: string
  /** clase del contenedor del dialogo (cf-dialog, bl-dialog, cd-drawer…) */
  className: string
  /** clase del overlay (cf-overlay centrado o cd-overlay para el drawer) */
  overlayClassName?: string
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Base accesible de todos los dialogos/drawers de la app:
 * - role="dialog" + aria-modal + aria-labelledby
 * - el foco entra al abrir (al elemento con `data-autofocus`, o al contenedor)
 * - Tab queda ATRAPADO dentro (el fondo es inerte de verdad)
 * - Escape cierra SIEMPRE (antes solo la mitad de los dialogos lo hacia)
 * - al cerrar, el foco vuelve al elemento que abrio el dialogo
 *
 * En dialogos destructivos, pon `data-autofocus` en "Cancelar": asi un Enter
 * de inercia no dispara la accion peligrosa.
 */
function Dialog({ labelledBy, className, overlayClassName = 'cf-overlay', onClose, children }: Props): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const box = boxRef.current
    const auto = box?.querySelector<HTMLElement>('[data-autofocus]')
    ;(auto ?? box)?.focus()
    return () => opener?.focus()
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const box = boxRef.current
    if (!box) return
    const nodes = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement
    )
    if (nodes.length === 0) {
      e.preventDefault()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === box)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={overlayClassName} onClick={onClose}>
      <div
        ref={boxRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}

export default Dialog
