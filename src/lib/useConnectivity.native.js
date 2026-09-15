import React, { useState, useEffect, useRef, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';

const RECONNECT_FLASH_MS = 4000;

/**
 * Cross-platform connectivity state.
 * - isConnected: live network state (NetInfo → navigator.onLine on web).
 * - justReconnected: true for a short window after an offline→online edge,
 *   so screens can show "your queued SOS went through" style notices.
 */
export function useConnectivity() {
  const [isConnected, setIsConnected] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const prevConnected = useRef(true);
  const flashTimer = useRef(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected;
      setIsConnected(connected);
      if (connected && !prevConnected.current) {
        setJustReconnected(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(
          () => setJustReconnected(false),
          RECONNECT_FLASH_MS
        );
      }
      prevConnected.current = connected;
    });
    return () => {
      unsub();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const dismissReconnected = useCallback(() => setJustReconnected(false), []);

  return { isConnected, justReconnected, dismissReconnected };
}

