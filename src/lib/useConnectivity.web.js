/**
 * Web implementation of useConnectivity.
 *
 * @react-native-community/netinfo hard-requires its native module and throws
 * at import time on web (react-native-web has no counterpart), so the browser
 * uses the standard `online`/`offline` window events instead. Semantics match
 * the native hook exactly.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const RECONNECT_FLASH_MS = 4000;

export function useConnectivity() {
  const [isConnected, setIsConnected] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const prevConnected = useRef(true);
  const flashTimer = useRef(null);

  useEffect(() => {
    const goOffline = () => {
      setIsConnected(false);
      prevConnected.current = false;
    };
    const goOnline = () => {
      setIsConnected(true);
      if (!prevConnected.current) {
        setJustReconnected(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(
          () => setJustReconnected(false),
          RECONNECT_FLASH_MS
        );
      }
      prevConnected.current = true;
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    setIsConnected(navigator.onLine);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const dismissReconnected = useCallback(() => setJustReconnected(false), []);

  return { isConnected, justReconnected, dismissReconnected };
}
