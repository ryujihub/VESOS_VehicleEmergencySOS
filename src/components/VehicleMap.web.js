import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MapPin, Navigation } from 'lucide-react-native';
import { theme, fonts } from '../theme/theme';

// Web fallback: react-native-maps cannot run in a browser. During an active
// job this shows the live distance to the mechanic instead of a map.
export default function VehicleMap({
  initialLocation,
  addressText,
  distanceKm,
  showLiveTracking = false,
}) {
  if (showLiveTracking) {
    return (
      <View style={styles.liveBox}>
        <Navigation size={16} color={theme.amber} />
        <Text style={styles.liveTitle}>Live tracking active</Text>
        <Text style={styles.liveText}>
          {distanceKm != null
            ? `Your mechanic is ${distanceKm} km away.`
            : 'Waiting for your mechanic to share their location…'}
        </Text>
        <Text style={styles.hint}>Interactive map available in the mobile app.</Text>
      </View>
    );
  }
  return (
    <View style={styles.fallback}>
      <MapPin size={16} color={theme.textFaint} />
      <Text style={styles.text}>
        Map available in the mobile app — showing {addressText || 'your live location'}.
      </Text>
    </View>
 );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceAlt,
    gap: 6,
    padding: 12,
  },
  text: { fontFamily: fonts.body, fontSize: 11.5, color: theme.textFaint, textAlign: 'center' },
  liveBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.raised,
    gap: 4,
    padding: 12,
  },
  liveTitle: { fontFamily: fonts.bodySemibold, fontSize: 13, color: theme.text, marginTop: 4 },
  liveText: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, textAlign: 'center' },
  hint: { fontFamily: fonts.body, fontSize: 10.5, color: theme.textFaint, marginTop: 4 },
});
