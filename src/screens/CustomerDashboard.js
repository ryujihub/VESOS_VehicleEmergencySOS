import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking, Alert } from 'react-native';
import { Siren, PhoneCall, MessageSquareWarning, MapPin, Car as CarIcon, CheckCircle2, Clock, Wrench, ChevronRight, Battery, Fuel, KeyRound, CircleDot, Camera, LogOut } from 'lucide-react-native';
import { signOut } from 'firebase/auth';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import * as ImagePicker from 'expo-image-picker';
import VehicleMap from '../components/VehicleMap';
import { auth, db, storage } from '../../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, getDoc, getDocs, updateDoc, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { theme, fonts } from '../theme/theme';
import { haversineKm } from '../lib/geo';

const ISSUES = [
  { key: "battery", label: "Dead battery", icon: Battery },
  { key: "flat", label: "Flat tire", icon: CircleDot },
  { key: "fuel", label: "Out of fuel", icon: Fuel },
  { key: "lockout", label: "Locked out", icon: KeyRound },
  { key: "other", label: "Other issue", icon: CarIcon },
];

// Mechanics with a contact number, cached locally so the offline SMS
// escalation can address real people even with no data connection.
const MECHANICS_CACHE_KEY = 'sos_mechanics_cache_v1';
const SOS_WRITE_TIMEOUT_MS = 6000;

// Firestore doesn't reject writes while offline — it queues them and the
// promise hangs. This timeout turns "hanging" into a decision.
const withTimeout = (promise, ms) =>
  new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error('SOS_WRITE_TIMEOUT')), ms);
    promise.finally(() => clearTimeout(t));
  });

const loadCachedMechanics = async () => {
  try {
    const raw = await AsyncStorage.getItem(MECHANICS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const STEPS = [
  { key: "sent", label: "Request sent" },
  { key: "matching", label: "Finding nearby mechanic" },
  { key: "accepted", label: "Mechanic accepted" },
  { key: "enroute", label: "Mechanic en route" },
  { key: "arrived", label: "Mechanic arrived" },
  { key: "done", label: "Service completed" },
];

function HazardStripe({ height = 6 }) {
  // A simple representation of hazard stripe using borders for now
  return (
    <View style={{ height, backgroundColor: theme.amber, opacity: 0.9, flexDirection: 'row', overflow: 'hidden' }}>
        {[...Array(20)].map((_, i) => (
            <View key={i} style={{ width: 15, height: 15, backgroundColor: theme.bg, transform: [{ rotate: '45deg' }], marginLeft: -5, marginTop: -5 }} />
        ))}
    </View>
  );
}

function StepTracker({ currentIndex }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
      {STEPS.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'flex-start', minHeight: 40, gap: 12 }}>
            <View style={{ width: 18, alignItems: 'center' }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: done ? theme.green : active ? theme.amber : "transparent",
                  borderWidth: 2,
                  borderColor: done ? theme.green : active ? theme.amber : theme.borderStrong,
                }}
              />
              {i < STEPS.length - 1 && (
                <View
                  style={{
                    width: 2,
                    flex: 1,
                    backgroundColor: done ? theme.green : theme.border,
                    marginTop: 2,
                    minHeight: 20
                  }}
                />
              )}
            </View>
            <View style={{ paddingBottom: 14 }}>
              <Text
                style={{
                  fontFamily: active ? fonts.bodySemibold : fonts.body,
                  fontSize: 13.5,
                  color: done || active ? theme.text : theme.textFaint,
                }}
              >
                {s.label}
              </Text>
              {active && (
                <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: theme.amber, marginTop: 2 }}>in progress…</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function CustomerDashboard() {
  const [phase, setPhase] = useState("form");
  const [issue, setIssue] = useState(null);
  const [issueDetails, setIssueDetails] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [notifyContact, setNotifyContact] = useState(true);
  const [smsRecipients, setSmsRecipients] = useState([]);
  
  const [stepIndex, setStepIndex] = useState(0);
  const [smsStatus, setSmsStatus] = useState("idle");
  const [currentRequestId, setCurrentRequestId] = useState(null);
  const [mechanicInfo, setMechanicInfo] = useState(null);
  const [mechanicLoc, setMechanicLoc] = useState(null);
  const [requestLoc, setRequestLoc] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [initialLocation, setInitialLocation] = useState(null);
  const [addressText, setAddressText] = useState("Fetching location...");
  const timers = useRef([]);
  const pendingWriteRef = useRef(null);
  const abandonedRef = useRef(false);

  // Refresh the offline mechanic directory whenever the SOS form is shown.
  // Equality-only filters don't need a composite index; verified/setup
  // filtering happens client-side on the small result set.
  useEffect(() => {
    if (phase !== "form") return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where("role", "==", "MECHANIC")));
        const list = snap.docs
          .map((d) => d.data())
          .filter((m) => m.isVerified && m.isSetupComplete && m.contactNumber)
          .map((m) => ({ name: m.name || 'Mechanic', shopName: m.shopName || '', contactNumber: m.contactNumber }))
          .slice(0, 8);
        if (list.length > 0) {
          await AsyncStorage.setItem(MECHANICS_CACHE_KEY, JSON.stringify(list));
        }
      } catch (e) {
        console.log('Mechanic directory refresh failed (will use cache):', e);
      }
    })();
  }, [phase]);

  // Resume an in-progress emergency after a reload/app restart — a driver
  // must never lose their tracking screen mid-SOS. (Unindexed single-field
  // query; active filtering + ordering done client-side.)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(collection(db, 'serviceRequests'), where("customerId", "==", uid));
    const unsub = onSnapshot(q, (snapshot) => {
      if (currentRequestId) return; // already tracking something
      const ACTIVE = ["PENDING", "ACCEPTED", "ENROUTE", "ARRIVED"];
      const active = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => ACTIVE.includes(r.status))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      if (active.length > 0) {
        setCurrentRequestId(active[0].id);
        setPhase("tracking");
      }
    });
    return () => unsub();
  }, [currentRequestId]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAddressText("Location permission denied");
        return;
      }
      try {
        let loc = await Location.getCurrentPositionAsync({});
        setInitialLocation(loc.coords);
        let geo = await Location.reverseGeocodeAsync(loc.coords);
        if (geo && geo.length > 0) {
          const g = geo[0];
          setAddressText(`Sharing live location · ${g.street || g.name || g.city || 'Unknown Street'}`);
        } else {
          setAddressText("Coordinates active (No address)");
        }
      } catch(e) {
         setAddressText("Location fetch failed");
      }
    })();
    return () => timers.current.forEach(clearTimeout);
  }, []);

  // Queued-write recovery: if a timed-out SOS write lands after we've fallen
  // back to SMS mode, jump back into normal tracking automatically.
  useEffect(() => {
    const pending = pendingWriteRef.current;
    if (!pending || abandonedRef.current === false) return;
    let cancelled = false;
    pending
      .then((docRef) => {
        if (cancelled || !abandonedRef.current) return;
        abandonedRef.current = false;
        setCurrentRequestId(docRef.id);
        setPhase("tracking");
        setStepIndex(0);
      })
      .catch(() => {}); // never landed; SMS path stands
    return () => { cancelled = true; };
  }, [phase]);

  useEffect(() => {
    if (currentRequestId) {
      const unsub = onSnapshot(doc(db, 'serviceRequests', currentRequestId), async (snapshot) => {
        const data = snapshot.data();
        if (data) {
          // Look up the accepted mechanic's profile so the tracking screen can
          // show real name/shop and a tappable call button.
          if (data.mechanicId) {
            getDoc(doc(db, 'users', data.mechanicId))
              .then((m) => m.exists() && setMechanicInfo({ id: m.id, ...m.data() }))
              .catch((e) => console.warn('Mechanic lookup failed:', e));
          }
          // Mechanic's live position, normalized to {latitude, longitude}.
          setMechanicLoc(
            data.mechanicLocation
              ? { latitude: data.mechanicLocation.lat, longitude: data.mechanicLocation.lng }
              : null
          );
          // Where the SOS came from — anchors the tracking map even if the
          // device can't provide live GPS later.
          if (data.location) {
            setRequestLoc({ latitude: data.location.lat, longitude: data.location.lng });
          }
          if (data.status === 'PENDING') setStepIndex(0);
          else if (data.status === 'ACCEPTED') setStepIndex(2);
          else if (data.status === 'ENROUTE') setStepIndex(3);
          else if (data.status === 'ARRIVED') setStepIndex(4);
          else if (data.status === 'DONE') { 
            setStepIndex(5); 
            setTimeout(() => setPhase('done'), 1000); 
          }
        }
      });
      return () => unsub();
    }
  }, [currentRequestId]);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    pendingWriteRef.current = null;
    abandonedRef.current = false;
    setPhase("form");
    setIssue(null);
    setIssueDetails("");
    setPlate("");
    setVehicleInfo("");
    setContactNumber("");
    setStepIndex(0);
    setSmsStatus("idle");
    setCurrentRequestId(null);
    setPhoto(null);
    setMechanicInfo(null);
    setMechanicLoc(null);
    setRequestLoc(null);
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const sendSOS = async () => {
    try {
        // An emergency must never silently fail: if location is unavailable,
        // fall back to a coarse area so the SOS still goes out and mechanics
        // can still call the driver.
        let { status } = await Location.requestForegroundPermissionsAsync();
        let location = null;
        if (status === 'granted') {
            try {
                location = await Location.getCurrentPositionAsync({});
            } catch (locErr) {
                console.log('Position fetch failed:', locErr);
            }
        }
        if (!location) {
            try {
                const last = await Location.getLastKnownPositionAsync();
                if (last) location = last;
            } catch (e) {}
        }
        if (!location) {
            // Metro Manila approximation so the request is still usable.
            location = { coords: { latitude: 14.5995, longitude: 120.9842 } };
            Alert.alert(
                'Location unavailable',
                "We couldn't get your precise GPS position. The request was sent with an approximate area — tell the mechanic your location when they call."
            );
        }
        
        setUploadingImage(true);
        let imageUrl = null;
        if (photo) {
            try {
                const response = await fetch(photo);
                const blob = await response.blob();
                const storageRef = ref(storage, `emergencies/${Date.now()}.jpg`);
                await uploadBytes(storageRef, blob);
                imageUrl = await getDownloadURL(storageRef);
            } catch (e) {
                console.log("Photo upload failed:", e);
            }
        }
        setUploadingImage(false);
        
        try {
            // Optional: include the driver's registered name so the mechanic
            // sees who they're calling.
            let customerName = null;
            if (auth.currentUser) {
                try {
                    const profileSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                    if (profileSnap.exists()) customerName = profileSnap.data().name || null;
                } catch (e) {
                    console.log('Profile lookup failed:', e);
                }
            }

            const sosDoc = {
                customerId: auth.currentUser?.uid || 'guest',
                contactName: customerName,
                status: 'PENDING',
                issueType: issue,
                issueDetails,
                plate,
                vehicleInfo,
                contactNumber: contactNumber.trim(),
                location: {
                    lat: location.coords.latitude,
                    lng: location.coords.longitude
                },
                imageUrl,
                createdAt: serverTimestamp(),
            };

            // Timeout instead of hang: if the write hasn't confirmed in
            // SOS_WRITE_TIMEOUT_MS, treat connectivity as lost and escalate
            // to SMS. The queued write may still land when data returns —
            // setPhase('tracking') below reconciles either way.
            abandonedRef.current = false;
            pendingWriteRef.current = addDoc(collection(db, 'serviceRequests'), sosDoc);
            const docRef = await withTimeout(pendingWriteRef.current, SOS_WRITE_TIMEOUT_MS);

            setCurrentRequestId(docRef.id);
            setPhase("tracking");
            setStepIndex(0);

        } catch (firebaseErr) {
            console.log("Firebase write timed out or failed — escalating to SMS:", firebaseErr);
            abandonedRef.current = true;
            await escalateToSms(location);
        }

    } catch (err) {
        console.error("Error", err.message);
        Alert.alert('Something went wrong', 'Your SOS could not be sent. Please try again or call the hotline.');
    }
  };

  // The driver's name for the SMS payload: prefer the registered profile.
  const customerNameForSms = async () => {
    try {
      if (auth.currentUser) {
        const profileSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (profileSnap.exists() && profileSnap.data().name) return profileSnap.data().name;
      }
    } catch (e) {}
    return 'Driver';
  };

  // Offline escalation: text the cached, real, nearby mechanics (and the
  // emergency contact if opted in) with the full SOS details and a maps link.
  const escalateToSms = async (location) => {
    const name = await customerNameForSms();
    const lat = location.coords.latitude.toFixed(5);
    const lng = location.coords.longitude.toFixed(5);
    const issueLabel = issue ? ISSUES.find((i) => i.key === issue)?.label.toUpperCase() : 'VEHICLE TROUBLE';
    const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    const payload = [
      `SOS ${plate || '—'} ${issueLabel}`,
      `${vehicleInfo || 'Vehicle details unknown'} — driver: ${name}`,
      contactNumber.trim() ? `Call driver: ${contactNumber.trim()}` : null,
      `Location: ${mapsLink}`,
    ].filter(Boolean).join('\n');

    const cached = await loadCachedMechanics();
    const recipients = cached.map((m) => m.contactNumber);
    setSmsRecipients(cached);

    if (notifyContact && emergencyContact.trim()) {
      recipients.push(emergencyContact.trim());
    }

    setPhase("smsFallback");
    setSmsStatus("sending");

    if (recipients.length === 0) {
      setSmsStatus('none');
      return;
    }

    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable) {
        await SMS.sendSMSAsync(recipients, payload);
        setSmsStatus("sent");
      } else {
        // Web (or SMS-less device): show the payload + recipients so the
        // driver can call or copy them. No fake success.
        setSmsStatus('manual');
      }
    } catch (smsErr) {
      console.log('SMS send failed:', smsErr);
      setSmsStatus('manual');
    }
  };

  return (
    <View style={styles.container}>
      <HazardStripe height={4} />
      
      {phase === "form" && (
        <ScrollView style={styles.flex1} contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.headerArea}>
            <View style={styles.rowBetween}>
              <Text style={styles.title}>Vehicle trouble?</Text>
              <TouchableOpacity
                onPress={() => signOut(auth).catch((e) => console.warn('Sign out failed:', e))}
                style={styles.signOutBtn}
              >
                <LogOut size={15} color={theme.textFaint} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>Kailangan mo ng tulong? Tell us what's wrong and where you are.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>WHAT'S THE ISSUE</Text>
            <View style={styles.grid}>
              {ISSUES.map((it) => {
                const Icon = it.icon;
                const active = issue === it.key;
                return (
                  <TouchableOpacity
                    key={it.key}
                    onPress={() => setIssue(it.key)}
                    style={[
                      styles.issueCard,
                      {
                        backgroundColor: active ? theme.raised : theme.surfaceAlt,
                        borderColor: active ? theme.amber : theme.border,
                      }
                    ]}
                  >
                    <Icon size={18} color={active ? theme.amber : theme.textMuted} />
                    <Text style={[styles.issueText, { color: active ? theme.text : theme.textMuted }]}>
                      {it.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>ADDITIONAL DETAILS (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              multiline
              value={issueDetails}
              onChangeText={setIssueDetails}
              placeholder="e.g. Engine makes a loud clicking sound..."
              placeholderTextColor={theme.textFaint}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>PLATE NUMBER</Text>
            <TextInput
              style={styles.input}
              value={plate}
              onChangeText={(text) => setPlate(text.toUpperCase())}
              placeholder="ABC 1234"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>CONTACT NUMBER (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              value={contactNumber}
              onChangeText={(text) => setContactNumber(text.replace(/[^0-9+]/g, ''))}
              placeholder="0917 123 4567"
              placeholderTextColor={theme.textFaint}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>VEHICLE TYPE & COLOR</Text>
            <TextInput
              style={styles.input}
              value={vehicleInfo}
              onChangeText={setVehicleInfo}
              placeholder="e.g. Toyota Innova Gray"
              placeholderTextColor={theme.textFaint}
            />
          </View>

          <View style={[styles.section, { paddingBottom: 10 }]}>
            <View style={styles.locationBox}>
              <MapPin size={15} color={theme.textMuted} />
              <Text style={styles.locationText}>{addressText}</Text>
            </View>
            {initialLocation && (
              <View style={{ marginTop: 12, height: 120, borderRadius: 8, overflow: 'hidden' }}>
                <VehicleMap
                  initialLocation={initialLocation}
                  addressText={addressText}
                />
              </View>
            )}
          </View>

          <View style={[styles.section, styles.rowBetween, { marginTop: 12 }]}>
            <Text style={styles.locationText}>Notify emergency contact</Text>
            <TouchableOpacity
              onPress={() => setNotifyContact(!notifyContact)}
              style={[
                styles.toggleContainer,
                { backgroundColor: notifyContact ? theme.green : theme.border }
              ]}
            >
              <View style={[styles.toggleThumb, { left: notifyContact ? 19 : 3 }]} />
            </TouchableOpacity>
          </View>

          {notifyContact && (
            <View style={styles.section}>
              <Text style={styles.label}>EMERGENCY CONTACT NUMBER</Text>
              <TextInput
                style={styles.input}
                value={emergencyContact}
                onChangeText={(text) => setEmergencyContact(text.replace(/[^0-9+]/g, ''))}
                placeholder="0918 123 4567"
                placeholderTextColor={theme.textFaint}
                keyboardType="phone-pad"
              />
              <Text style={styles.hintText}>
                Texted your SOS details and location if there's no data signal.
              </Text>
            </View>
          )}

          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <TouchableOpacity onPress={takePhoto} style={styles.photoBtn}>
              <Camera size={16} color={photo ? theme.green : theme.textMuted} />
              <Text style={[styles.locationText, { color: photo ? theme.green : theme.textMuted }]}>
                {photo ? "Photo attached (tap to retake)" : "Add a photo of the problem"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <TouchableOpacity
              disabled={!issue || uploadingImage}
              onPress={sendSOS}
              style={[
                styles.sosButton,
                {
                  backgroundColor: issue ? theme.red : theme.surfaceAlt,
                  borderColor: issue ? theme.red : theme.border,
                  opacity: issue ? 1 : 0.5,
                }
              ]}
            >
              <Siren size={20} color={theme.text} />
              <Text style={styles.sosButtonText}>Send SOS</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {phase === "tracking" && (
        <View style={styles.flex1}>
          <View style={styles.trackingHeader}>
            <View style={styles.row}>
              <Siren size={16} color={theme.red} />
              <Text style={styles.emergencyActiveText}>EMERGENCY REQUEST ACTIVE</Text>
            </View>
            <Text style={styles.trackingTitle}>
              {stepIndex < 5 ? "Help is on the way" : "Almost there"}
            </Text>
          </View>
          
          <ScrollView style={styles.flex1}>
            <StepTracker currentIndex={stepIndex} />
            
            {stepIndex >= 2 && requestLoc && (
              <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <View style={{ height: 170, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
                  <VehicleMap
                    initialLocation={requestLoc}
                    customerLocation={requestLoc}
                    mechanicLocation={mechanicLoc}
                    showLiveTracking
                    distanceKm={
                      mechanicLoc
                        ? haversineKm(requestLoc.latitude, requestLoc.longitude, mechanicLoc.latitude, mechanicLoc.longitude).toFixed(1)
                        : null
                    }
                  />
                </View>
                <Text style={styles.distanceText}>
                  {mechanicLoc
                    ? `Your mechanic is ${haversineKm(requestLoc.latitude, requestLoc.longitude, mechanicLoc.latitude, mechanicLoc.longitude).toFixed(1)} km away · updates live`
                    : 'Waiting for your mechanic to share their location…'}
                </Text>
              </View>
            )}

            {stepIndex >= 2 && (
              <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <View style={styles.mechanicBox}>
                  <View style={styles.mechanicIconBox}>
                    <Wrench size={18} color={theme.amber} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.mechanicName}>
                      {mechanicInfo?.shopName || mechanicInfo?.name || 'Finding your mechanic…'}
                    </Text>
                    <Text style={styles.mechanicSub}>
                      {mechanicInfo?.name || 'Mechanic'}
                      {mechanicInfo?.idUrl ? ' · ID verified' : ''}
                    </Text>
                  </View>
                  {mechanicInfo?.contactNumber ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${mechanicInfo.contactNumber}`)}>
                      <PhoneCall size={17} color={theme.amber} />
                    </TouchableOpacity>
                  ) : (
                    <PhoneCall size={17} color={theme.textFaint} />
                  )}
                </View>
              </View>
            )}
            
            <View style={{ paddingHorizontal: 20, paddingVertical: 20 }}>
              <TouchableOpacity
                onPress={() => {
                  if (currentRequestId) {
                    updateDoc(doc(db, 'serviceRequests', currentRequestId), { status: 'CANCELLED' })
                      .catch((e) => console.warn('Cancel failed:', e));
                  }
                  reset();
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel request</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      {phase === "smsFallback" && (
        <ScrollView style={styles.flex1}>
          <View style={styles.trackingHeader}>
            <View style={styles.row}>
              <MessageSquareWarning size={17} color={theme.amber} />
              <Text style={[styles.emergencyActiveText, { color: theme.amber }]}>NO SIGNAL — SMS MODE</Text>
            </View>
            <Text style={styles.trackingTitle}>Sending your SOS by text</Text>
            <Text style={styles.smsDesc}>Data isn't reaching your phone, so we're using SMS instead — it works on weaker signal.</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.smsPayload}>
              <Text style={styles.smsPayloadText}>
                SOS {plate || "—"} {issue ? ISSUES.find((i) => i.key === issue)?.label.toUpperCase() : ""}
                {"\n"}{vehicleInfo || 'Vehicle details unknown'}
                {"\n"}Location: https://maps.google.com/?q={initialLocation ? `${initialLocation.latitude.toFixed(5)},${initialLocation.longitude.toFixed(5)}` : '—'}
              </Text>
            </View>
            <View style={[styles.row, { marginTop: 12 }]}>
              {smsStatus === "sending" && (
                <>
                  <Clock size={14} color={theme.amber} />
                  <Text style={[styles.smsStatusText, { color: theme.amber }]}>Texting nearby registered mechanics…</Text>
                </>
              )}
              {smsStatus === "sent" && (
                <>
                  <CheckCircle2 size={14} color={theme.green} />
                  <Text style={[styles.smsStatusText, { color: theme.green }]}>SMS handed to your phone for delivery.</Text>
                </>
              )}
              {smsStatus === "none" && (
                <>
                  <MessageSquareWarning size={14} color={theme.amber} />
                  <Text style={[styles.smsStatusText, { color: theme.amber }]}>No cached mechanics yet — call the hotline below.</Text>
                </>
              )}
              {smsStatus === "manual" && (
                <>
                  <MessageSquareWarning size={14} color={theme.amber} />
                  <Text style={[styles.smsStatusText, { color: theme.amber }]}>Can't auto-send here — tap a mechanic below to call.</Text>
                </>
              )}
            </View>
            {smsRecipients.length > 0 && (
              <View style={{ marginTop: 10 }}>
                {smsRecipients.map((m, idx) => (
                  <TouchableOpacity
                    key={`${m.contactNumber}-${idx}`}
                    style={[styles.listItem, idx === 0 && { borderTopWidth: 0 }]}
                    onPress={() => Linking.openURL(`tel:${m.contactNumber.replace(/[^0-9+]/g, '')}`)}
                  >
                    <PhoneCall size={16} color={theme.amber} />
                    <View style={styles.flex1}>
                      <Text style={styles.listTitle}>{m.shopName || m.name}</Text>
                      <Text style={styles.listSub}>{m.contactNumber} · tap to call</Text>
                    </View>
                    <ChevronRight size={15} color={theme.textFaint} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>WHILE YOU WAIT — OTHER WAYS TO GET HELP</Text>
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => Linking.openURL('tel:09170000000')}
            >
              <PhoneCall size={16} color={theme.text} />
              <View style={styles.flex1}>
                <Text style={styles.listTitle}>Call AyudaAuto Hotline</Text>
                <Text style={styles.listSub}>0917 000 0000 · 24/7 · tap to call</Text>
              </View>
              <ChevronRight size={15} color={theme.textFaint} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
            <TouchableOpacity onPress={reset} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {phase === "done" && (
        <View style={[styles.flex1, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
          <View style={styles.successIconBox}>
            <CheckCircle2 size={32} color={theme.green} />
          </View>
          <Text style={styles.trackingTitle}>Service completed</Text>
          <Text style={[styles.smsDesc, { textAlign: 'center' }]}>
            {mechanicInfo?.shopName || mechanicInfo?.name || 'Your mechanic'} completed the job.
            {mechanicInfo?.contactNumber ? ` Questions? Call ${mechanicInfo.shopName || mechanicInfo.name} at ${mechanicInfo.contactNumber}.` : ''}
          </Text>
          <TouchableOpacity onPress={reset} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerArea: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  signOutBtn: { borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 7 },
  title: { fontFamily: fonts.displayBold, fontSize: 21, color: theme.text },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, marginTop: 4 },
  section: { paddingHorizontal: 20, marginTop: 16 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12, color: theme.textMuted, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  issueCard: { 
    width: '48%', 
    borderWidth: 1.5, 
    borderRadius: 6, 
    paddingVertical: 12, 
    paddingHorizontal: 10 
  },
  issueText: { fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 6 },
  input: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.text,
    fontFamily: fonts.body,
    fontSize: 14,
    letterSpacing: 1,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationText: { fontFamily: fonts.body, fontSize: 12.5, color: theme.textMuted },
  toggleContainer: { width: 38, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: theme.text, position: 'absolute', top: 3 },
  sosButton: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sosButtonText: { fontFamily: fonts.displayBold, fontSize: 16, color: theme.text, letterSpacing: 0.3 },
  trackingHeader: { paddingHorizontal: 20, paddingTop: 20 },
  emergencyActiveText: { fontFamily: fonts.bodySemibold, fontSize: 12, color: theme.red },
  trackingTitle: { fontFamily: fonts.displayBold, fontSize: 19, color: theme.text, marginTop: 4 },
  mechanicBox: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mechanicIconBox: { width: 40, height: 40, borderRadius: 6, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  distanceText: { fontFamily: fonts.body, fontSize: 11.5, color: theme.textMuted, marginTop: 8 },
  hintText: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, marginTop: 6 },
  mechanicName: { fontFamily: fonts.bodySemibold, fontSize: 13.5, color: theme.text },
  mechanicSub: { fontFamily: fonts.body, fontSize: 11.5, color: theme.textMuted },
  cancelBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cancelBtnText: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  smsDesc: { fontFamily: fonts.body, fontSize: 12.5, color: theme.textMuted, marginTop: 4, lineHeight: 18 },
  smsPayload: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
  },
  smsPayloadText: { fontFamily: 'monospace', fontSize: 12, color: theme.textMuted, lineHeight: 18 },
  smsStatusText: { fontFamily: fonts.body, fontSize: 12.5 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border },
  listTitle: { fontFamily: fonts.body, fontSize: 13, color: theme.text },
  listSub: { fontFamily: fonts.body, fontSize: 11.5, color: theme.textFaint },
  successIconBox: { width: 64, height: 64, borderRadius: 12, backgroundColor: theme.greenDim, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  doneBtn: { marginTop: 24, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  doneBtnText: { fontFamily: fonts.body, fontSize: 13, color: theme.text }
});
