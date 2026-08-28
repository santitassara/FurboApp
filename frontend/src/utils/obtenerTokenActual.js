import { auth } from '../config/firebase';
import { TOKEN_KEY } from '../context/AuthContext';

export default async function obtenerTokenActual() {
  if (auth?.currentUser) return auth.currentUser.getIdToken();
  return localStorage.getItem(TOKEN_KEY);
}
