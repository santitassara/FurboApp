export function rutaGrupo(grupoId, sufijo = '') {
  return `/grupos/${grupoId}${sufijo}`;
}
