import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff, CheckCircle2 } from 'lucide-react-native';
import { useConnectivity } from '../lib/useConnectivity';
import { theme, fonts } from '../theme/theme';

const RECONNECT_FLASH_MS = 4000;

/**
 * Slim status bar pinned above screen content.
 * Offline: amber "no signal" bar. Reconnect: green "back online" flash that
 * auto-dismisses. Renders nothing while fully online and quiet.
 */
export function ConnectivityBanner() {
  const { isConnected, justReconnected, dismissReconnected } = useConnectivity();

  useEffect(() => {
    if (justReconnected) {
      const t = setTimeout(dismissReconnected, RECONNECT_FLASH_MS);
      return () => clearTimeout(t);
    }
  }, [justReconnected, dismissReconnected]);

  if (isConnected && !justReconnected) return null;

  return (
    <View
      style={[
        styles.banner,
        isConnected ? styles.backOnline : styles.offline,
      ]}
    >
      {isConnected ? (
        <CheckCircle2 size={14} color={theme.green} />
      ) : (
        <WifiOff size={14} color={theme.amber} />
      )}
      <Text
        style={[
          styles.text,
          { color: isConnected ? theme.green : theme.amber },
        ]}
      >
        {isConnected
          ? 'Back online — syncing…'
          : "No internet — requests will send by SMS or queue until you're back online"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  offline: {
    backgroundColor: theme.amberDim,
    borderBottomColor: theme.amber,
  },
  backOnline: {
    backgroundColor: theme.greenDim,
    borderBottomColor: theme.green,
  },
  text: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
});
