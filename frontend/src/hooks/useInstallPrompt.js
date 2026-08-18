import { useEffect, useState } from 'react';

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // Detecta si está en iOS
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const appInstalled = window.navigator.standalone === true;

    // Puede instalar si es Android/iOS y no está instalada
    const canShowPrompt = (isAndroid || isIos) && !appInstalled;
    setCanInstall(canShowPrompt);

    // Escucha el evento de beforeinstallprompt en Android
    const handleBeforeInstallPrompt = () => {
      setCanInstall(true);
    };

    if (isAndroid) {
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }
  }, []);

  const triggerInstall = () => {
    // Accede a la instancia global creada en App.jsx
    if (window.__furboInstallPrompt) {
      const promptInstance = window.__furboInstallPrompt;

      // Si es Android y tiene el deferredPrompt
      if (promptInstance.deferredPrompt && promptInstance.isAndroid) {
        promptInstance.triggerAndroidPrompt();
      }
      // Si es iOS
      else if (promptInstance.isIos) {
        promptInstance.hideIosBanner();
        setTimeout(() => promptInstance.showIosBanner(), 100);
      }
    }
  };

  return { canInstall, triggerInstall };
}
