/**
 * Constantes de infraestructura compartidas por los servicios de git.
 * Antes cada servicio tenia su propia copia (con el mismo comentario).
 */

/** separador de campos poco probable en el contenido (unit separator) */
export const SEP = '\x1f'

/** timeout amplio para operaciones de red (fetch/pull/push) */
export const NET_TIMEOUT = 180_000
