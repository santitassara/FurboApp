import axios from 'axios';
import { auth } from '../config/firebase';
import { TOKEN_KEY } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const SERVER_URL = API_URL.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(async (config) => {
  const usuarioActual = auth?.currentUser;
  if (usuarioActual) {
    const token = await usuarioActual.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    const tokenPropio = localStorage.getItem(TOKEN_KEY);
    if (tokenPropio) {
      config.headers.Authorization = `Bearer ${tokenPropio}`;
    }
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
