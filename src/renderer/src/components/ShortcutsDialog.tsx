import Dialog from './Dialog'
import { useI18n } from '../lib/i18n'

interface Props {
  onClose: () => void
}

/** Hoja de atajos de teclado (se abre con "?" o desde la cabecera). */
function ShortcutsDialog({ onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const rows: [string, string][] = [
    ['F5 / Ctrl+R', t('keys.refresh')],
    ['Ctrl+Shift+F', t('keys.fetch')],
    ['Ctrl+B', t('keys.newBranch')],
    ['Ctrl+F', t('keys.search')],
    ['Esc', t('keys.escape')],
    ['?', t('keys.help')]
  ]
  return (
    <Dialog className="cf-dialog" labelledBy="ks-title" onClose={onClose}>
      <div className="cf-title" id="ks-title">
        {t('keys.title')}
      </div>
      <table className="ks-table">
        <tbody>
          {rows.map(([key, desc]) => (
            <tr key={key}>
              <td className="ks-key">
                <kbd>{key}</kbd>
              </td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cf-actions">
        <button onClick={onClose} data-autofocus>
          {t('common.close')}
        </button>
      </div>
    </Dialog>
  )
}

export default ShortcutsDialog
