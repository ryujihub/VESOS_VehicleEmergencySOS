import React, { useMemo } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

// Native (iOS/Android) implementation: real Google Maps with live markers.
export default function VehicleMap({
  initialLocation,
  customerLocation,
  mechanicLocation,
  showLiveTracking = false,
}) {
  const edgePadding = useMemo(
    () => ({ top: 60, bottom: 60, left: 60, right: 60 }),
    []
  );

  const region = useMemo(() => {
    const base = customerLocation || initialLocation;
    if (!showLiveTracking || !base) return null; // let initialRegion handle it
    return {
      latitude: base.latitude,
      longitude: base.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }, [showLiveTracking, customerLocation, initialLocation]);

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }}
      region={region || undefined}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {customerLocation && (
        <Marker
          coordinate={customerLocation}
          title="You are here"
          pinColor="#F5A623"
        />
      )}
      {mechanicLocation && (
        <Marker
          coordinate={mechanicLocation}
          title="Your mechanic"
          description="Live position"
          pinColor="#3AAE83"
        />
      )}
    </MapView>
  );
}
