import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function registrarSuscripcionPush(token) {
  if (Capacitor.isNativePlatform()) {
    await registrarTokenFcm(token);
    return;
  }

  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.error('Error registrando Service Worker:', error);
      return;
    }
  }

  // Pedir permiso para notificaciones
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') return;
    } catch (error) {
      console.error('Error solicitando permiso de notificaciones:', error);
      return;
    }
  }

  // Suscribirse a push notifications
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Obtener VAPID public key desde el backend o config
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.warn('VAPID public key no configurada');
        return;
      }

      const suscripcion = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Guardar suscripción en backend
      const response = await fetch(`${API_URL}/api/usuarios/me/suscripcion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(suscripcion),
      });

      if (!response.ok) {
        console.error('Error guardando suscripción:', response.statusText);
      }
    } catch (error) {
      console.error('Error con push notifications:', error);
    }
  }
}

async function registrarTokenFcm(token) {
  try {
    const permiso = await FirebaseMessaging.requestPermissions();
    if (permiso.receive !== 'granted') return;

    const { token: fcmToken } = await FirebaseMessaging.getToken();

    const response = await fetch(`${API_URL}/api/usuarios/me/fcm-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ fcmToken }),
    });

    if (!response.ok) {
      console.error('Error guardando token FCM:', response.statusText);
    }
  } catch (error) {
    console.error('Error con notificaciones FCM:', error);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export { registrarSuscripcionPush };
