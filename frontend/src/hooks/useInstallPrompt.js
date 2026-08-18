import { useEffect, useState } from 'react';

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const checkInstalled = () => {
      // Detecta si está en iOS
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isAndroid = /Android/.test(navigator.userAgent);

      // Verifica si ya está instalada
      const isInstalledIos = window.navigator.standalone === true;
      const isInstalledAndroid = localStorage.getItem('furbo-app-installed') === 'true';
      const appInstalled = isInstalledIos || isInstalledAndroid;

      // Puede instalar si es Android/iOS y no está instalada
      const canShowPrompt = (isAndroid || isIos) && !appInstalled;
      setCanInstall(canShowPrompt);
    };

    checkInstalled();

    // Escucha el evento de beforeinstallprompt en Android
    const handleBeforeInstallPrompt = () => {
      checkInstalled();
    };

    // Escucha el evento de instalación en Android
    const handleAppInstalled = () => {
      localStorage.setItem('furbo-app-installed', 'true');
      setCanInstall(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
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
