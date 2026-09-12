import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { Siren, PhoneCall, MessageSquareWarning, MapPin, Car as CarIcon, CheckCircle2, Clock, Wrench, ChevronRight, Battery, Fuel, KeyRound, CircleDot, Camera } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { auth, db, storage } from '../../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { theme, fonts } from '../theme/theme';

const ISSUES = [
  { key: "battery", label: "Dead battery", icon: Battery },
  { key: "flat", label: "Flat tire", icon: CircleDot },
  { key: "fuel", label: "Out of fuel", icon: Fuel },
  { key: "lockout", label: "Locked out", icon: KeyRound },
  { key: "other", label: "Other issue", icon: CarIcon },
];

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
  const [notifyContact, setNotifyContact] = useState(true);
  
  const [stepIndex, setStepIndex] = useState(0);
  const [smsStatus, setSmsStatus] = useState("idle");
  const [currentRequestId, setCurrentRequestId] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [initialLocation, setInitialLocation] = useState(null);
  const [addressText, setAddressText] = useState("Fetching location...");
  const timers = useRef([]);

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

  useEffect(() => {
    if (currentRequestId) {
      const unsub = onSnapshot(doc(db, 'serviceRequests', currentRequestId), (snapshot) => {
        const data = snapshot.data();
        if (data) {
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
    setPhase("form");
    setIssue(null);
    setIssueDetails("");
    setPlate("");
    setVehicleInfo("");
    setStepIndex(0);
    setSmsStatus("idle");
    setCurrentRequestId(null);
    setPhoto(null);
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const sendSOS = async () => {
    try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            console.log('Permission to access location was denied');
            return;
        }

        let location = await Location.getCurrentPositionAsync({});
        
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
            const docRef = await addDoc(collection(db, 'serviceRequests'), {
                customerId: auth.currentUser?.uid || 'guest',
                status: 'PENDING',
                issueType: issue,
                issueDetails,
                plate,
                vehicleInfo,
                location: {
                    lat: location.coords.latitude,
                    lng: location.coords.longitude
                },
                imageUrl,
                createdAt: serverTimestamp(),
            });
            
            setCurrentRequestId(docRef.id);
            setPhase("tracking");
            setStepIndex(0);

        } catch (firebaseErr) {
            console.log("Firebase failed, possibly offline: ", firebaseErr);
            setPhase("smsFallback");
            setSmsStatus("sending");
            
            const isAvailable = await SMS.isAvailableAsync();
            if (isAvailable) {
                await SMS.sendSMSAsync(
                    ['1234567890'], 
                    `SOS ${plate} ${issue} ${location.coords.latitude},${location.coords.longitude}`
                );
            }
            timers.current.push(setTimeout(() => setSmsStatus("sent"), 1800));
        }

    } catch (err) {
        console.error("Error", err.message);
    }
  };

  return (
    <View style={styles.container}>
      <HazardStripe height={4} />
      
      {phase === "form" && (
        <ScrollView style={styles.flex1} contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.headerArea}>
            <Text style={styles.title}>Vehicle trouble?</Text>
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
            {Platform.OS !== 'web' && initialLocation && (
              <View style={{ marginTop: 12, height: 120, borderRadius: 8, overflow: 'hidden' }}>
                <MapView 
                  provider={PROVIDER_GOOGLE}
                  style={{ flex: 1 }} 
                  initialRegion={{
                    latitude: initialLocation.latitude,
                    longitude: initialLocation.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                >
                  <Marker coordinate={initialLocation} />
                </MapView>
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
            
            {stepIndex >= 2 && (
              <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <View style={styles.mechanicBox}>
                  <View style={styles.mechanicIconBox}>
                    <Wrench size={18} color={theme.amber} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.mechanicName}>Kuya Mando's Auto Repair</Text>
                    <Text style={styles.mechanicSub}>2.3 km away · ★ 4.8</Text>
                  </View>
                  <PhoneCall size={17} color={theme.textMuted} />
                </View>
              </View>
            )}
            
            <View style={{ paddingHorizontal: 20, paddingVertical: 20 }}>
              <TouchableOpacity onPress={reset} style={styles.cancelBtn}>
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
              </Text>
            </View>
            <View style={[styles.row, { marginTop: 12 }]}>
              {smsStatus === "sending" && (
                <>
                  <Clock size={14} color={theme.amber} />
                  <Text style={[styles.smsStatusText, { color: theme.amber }]}>Sending to nearby registered mechanics…</Text>
                </>
              )}
              {smsStatus === "sent" && (
                <>
                  <CheckCircle2 size={14} color={theme.green} />
                  <Text style={[styles.smsStatusText, { color: theme.green }]}>Sent to nearby mechanics via SMS.</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>WHILE YOU WAIT — OTHER WAYS TO GET HELP</Text>
            <View style={styles.listItem}>
              <PhoneCall size={16} color={theme.text} />
              <View style={styles.flex1}>
                <Text style={styles.listTitle}>Call AyudaAuto Hotline</Text>
                <Text style={styles.listSub}>0917 000 0000 · 24/7</Text>
              </View>
              <ChevronRight size={15} color={theme.textFaint} />
            </View>
            <View style={styles.listItem}>
              <Wrench size={16} color={theme.text} />
              <View style={styles.flex1}>
                <Text style={styles.listTitle}>Nearby shop: Montalban Motorworks</Text>
                <Text style={styles.listSub}>1.1 km · open now</Text>
              </View>
              <ChevronRight size={15} color={theme.textFaint} />
            </View>
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
            Kuya Mando's Auto Repair replaced your battery. Total: ₱1,850
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
