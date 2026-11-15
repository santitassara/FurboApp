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