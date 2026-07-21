import type { ReactNode } from 'react'
import Dialog from './Dialog'
import { useI18n } from '../lib/i18n'

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
 *
 * En dialogos `danger` el foco inicial va a CANCELAR: si el usuario llego
 * pulsando Enter, otra pulsacion de inercia no dispara la accion destructiva.
 */
function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onCancel }: Props): JSX.Element {
  const { t } = useI18n()
  return (
    <Dialog className="cf-dialog" labelledBy="cf-title" onClose={onCancel}>
      <div className="cf-title" id="cf-title">
        {title}
      </div>
      <div className="cf-message">{message}</div>
      <div className="cf-actions">
        <button className="link" onClick={onCancel} data-autofocus={danger || undefined}>
          {t('common.cancel')}
        </button>
        <button
          className={danger ? 'danger' : ''}
          onClick={onConfirm}
          data-autofocus={!danger || undefined}
        >
          {confirmLabel ?? t('common.continue')}
        </button>
      </div>
    </Dialog>
  )
}

export default ConfirmDialog
