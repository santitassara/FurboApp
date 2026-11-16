import api from './api';
import { rutaGrupo } from '../utils/rutasGrupo';

export async function listarPartidosApostables(grupoId) {
  const { data } = await api.get(rutaGrupo(grupoId, '/apuestas/partidos-disponibles'));
  return data;
}

export async function obtenerSaldo(grupoId) {
  const { data } = await api.get(rutaGrupo(grupoId, '/apuestas/saldo'));
  return data;
}

export async function obtenerSaldoCasa(grupoId) {
  const { data } = await api.get(rutaGrupo(grupoId, '/apuestas/casa'));
  return data;
}

// Premios
export async function obtenerCatalogoPremios(grupoId) {
  const { data } = await api.get(rutaGrupo(grupoId, '/premios/catalogo'));
  return data;
}

export async function comprarPremio(grupoId, premioId, partidoId) {
  const { data } = await api.post(rutaGrupo(grupoId, '/premios/comprar'), { premioId, partidoId });
  return data;
}

export async function usarPremio(grupoId, compraId, metadata) {
  const { data } = await api.post(rutaGrupo(grupoId, `/premios/usar/${compraId}`), metadata);
  return data;
}

export async function obtenerMisPremios(grupoId) {
  const { data } = await api.get(rutaGrupo(grupoId, '/premios/mis-premios'));
  return data;
}

export async function obtenerEfectosActivos(grupoId) {
  const { data } = await api.get(rutaGrupo(grupoId, '/premios/efectos-activos'));
  return data;
}

export async function obtenerEfectosActivosPartido(grupoId, partidoId) {
  const { data } = await api.get(rutaGrupo(grupoId, `/premios/efectos-partido/${partidoId}`));
  return data;
}

export async function obtenerOpcionesPartido(grupoId, partidoId) {
  const { data } = await api.get(rutaGrupo(grupoId, `/apuestas/partido/${partidoId}/opciones`));
  return data;
}

export async function crearApuestas(grupoId, partidoId, apuestas) {
  const { data } = await api.post(rutaGrupo(grupoId, `/apuestas/partido/${partidoId}/apostar`), { apuestas });
  return data;
}

export async function obtenerMisApuestas(grupoId) {
  const { data } = await api.get(rutaGrupo(grupoId, '/apuestas/mis-apuestas'));
  return data;
}

export async function resolverPartido(grupoId, partidoId) {
  const { data } = await api.post(rutaGrupo(grupoId, `/apuestas/partido/${partidoId}/resolver`));
  return data;
}

export async function reembolsarPartido(grupoId, partidoId) {
  const { data } = await api.post(rutaGrupo(grupoId, `/apuestas/partido/${partidoId}/reembolsar`));
  return data;
}

export async function obtenerApuestasPartido(grupoId, partidoId) {
  const { data } = await api.get(rutaGrupo(grupoId, `/apuestas/partido/${partidoId}/apuestas`));
  return data;
}