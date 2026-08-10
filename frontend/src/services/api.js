import axios from 'axios';
import { auth } from '../config/firebase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

api.interceptors.request.use(async (config) => {
  const usuarioActual = auth.currentUser;
  if (usuarioActual) {
    const token = await usuarioActual.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const mensaje = error.response?.data?.error || 'Ocurrió un error inesperado';
    return Promise.reject(new Error(mensaje));
  }
);

export default api;
