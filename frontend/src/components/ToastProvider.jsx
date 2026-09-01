import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toast from './Toast';

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const perfilChequeado = useRef(null);

  function ocultarToast() {
    setToast(null);
  }

  useEffect(() => {
    if (!perfil?.uid || perfilChequeado.current === perfil.uid) return;
    perfilChequeado.current = perfil.uid;

    api
      .get('/usuarios/me/notificaciones/pendientes')
      .then(({ data }) => {
        if (data.hayPendientes) {
          setToast({
            mensaje: 'Te calificaron, mirá los resultados en tu perfil',
            onClick: () => {
              ocultarToast();
              navigate('/perfil');
            },
          });
        }
      })
      .catch(() => {});
  }, [perfil?.uid, navigate]);

  return (
    <>
      {children}
      {toast && <Toast mensaje={toast.mensaje} onClick={toast.onClick} onCerrar={ocultarToast} />}
    </>
  );
}
