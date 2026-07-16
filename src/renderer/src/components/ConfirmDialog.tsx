import type { ReactNode } from 'react'

export interface ConfirmSpec {
  title: string
  /** cuerpo del aviso (texto o markup) */
  message: ReactNode
  /** etiqueta del boton que confirma */
  confirmLabel?: string
  /** pinta el boton de confirmar como destructivo */
  danger?: boolean
  onConfirm: () => void
}

interface Props extends ConfirmSpec {
  onCancel: () => void
}

/**
 * Modal de confirmacion propio (no `window.confirm`, que bloquea el proceso del
 * renderer y no se puede estilar). Se usa antes de acciones que pierden trabajo
 * o que tocan el remoto: checkout con cambios sin guardar, borrar rama, etc.
 */
function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Continuar',
  danger = false,
  onConfirm,
  onCancel
}: Props): JSX.Element {
  return (
    <div className="cf-overlay" onClick={onCancel}>
      <div className="cf-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cf-title">{title}</div>
        <div className="cf-message">{message}</div>
        <div className="cf-actions">
          <button className="link" onClick={onCancel}>
            Cancelar
          </button>
          <button className={danger ? 'danger' : ''} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
