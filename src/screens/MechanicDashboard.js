import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image, Linking, Alert } from 'react-native';
import { MapPin, Siren, Car as CarIcon, CheckCircle2, Navigation, PhoneCall, LogOut } from 'lucide-react-native';
import { theme, fonts } from '../theme/theme';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebaseConfig';
import * as Location from 'expo-location';
import { haversineKm } from '../lib/geo';
import { ConnectivityBanner } from '../components/ConnectivityBanner';

export default function MechanicDashboard() {
  const [online, setOnline] = useState(true);
  const [request, setRequest] = useState(null);
  const [jobStatus, setJobStatus] = useState("accepted");
  const [requestData, setRequestData] = useState(null);
  const [mechanicName, setMechanicName] = useState('Mechanic');
  const [shopName, setShopName] = useState('Your Shop');
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const lastWriteRef = useRef({ at: 0, lat: null, lng: null });

  // Mirror of `request` that listeners can read synchronously. Firestore's
  // local-cache snapshots can fire before React commits a state update (e.g.
  // the PENDING query emptying right after Accept), and stale closures were
  // clearing requestData mid-accept — leaving the "Issue · undefined" card.
  const requestRef = useRef(null);
  const updateRequest = useCallback((value) => {
    requestRef.current = value;
    setRequest(value);
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) {
        setMechanicName(snap.data().name || 'Mechanic');
        setShopName(snap.data().shopName || 'Your Shop');
      }
    });
  }, []);

  // Resume any in-progress job on mount — otherwise a mechanic who accepted a
  // job and reloads/app-switches loses it, and the customer is stuck forever
  // at "mechanic accepted".
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(
      collection(db, 'serviceRequests'),
      where("mechanicId", "==", uid),
      where("status", "in", ["ACCEPTED", "ENROUTE", "ARRIVED"])
    );
    const unsubResume = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty && requestRef.current === null) {
        const reqDoc = snapshot.docs[0];
        const statusMap = { ACCEPTED: "accepted", ENROUTE: "enroute", ARRIVED: "arrived" };
        setRequestData({ id: reqDoc.id, ...reqDoc.data() });
        setJobStatus(statusMap[reqDoc.data().status] || "accepted");
        updateRequest("accepted");
      }
    });
    return () => unsubResume();
  }, [updateRequest]);

  useEffect(() => {
    let unsub = () => {};
    if (online) {
      const q = query(collection(db, 'serviceRequests'), where("status", "==", "PENDING"));
      unsub = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          if (requestRef.current !== "accepted") {
            const reqDoc = snapshot.docs[0];
            setRequestData({ id: reqDoc.id, ...reqDoc.data() });
            updateRequest("incoming");
          }
        } else {
          if (requestRef.current === "incoming") {
            updateRequest(null);
            setRequestData(null);
          }
        }
      });
    } else {
       if (requestRef.current === "incoming") {
         updateRequest(null);
         setRequestData(null);
       }
    }
    return () => unsub();
  }, [online, updateRequest]);

  const number = requestData?.contactNumber || null;
  const name = requestData?.contactName || null;
  const numberColor = number ? theme.amber : theme.textFaint;

  const callCustomer = () => {
    if (number) {
      Linking.openURL(`tel:${number.replace(/[^0-9+]/g, '')}`);
    } else {
      Alert.alert('No contact number', 'This driver did not leave a contact number.');
    }
  };

  // Share the mechanic's live position while a job is active. Firestore
  // writes are throttled to 5s or 150m of movement — enough for a smooth
  // customer-side tracker without hammering the database.
  useEffect(() => {
    const activeJob = request === "accepted" && requestData?.id;
    if (!activeJob || !online) {
      setSharingLocation(false);
      return;
    }
    let watchId = null;
    let cancelled = false;
    const requestId = requestData.id;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) {
          setLocationError('Location permission needed for live tracking');
          return;
        }
        setLocationError(null);
        watchId = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 25 },
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            const last = lastWriteRef.current;
            const movedM = last.lat == null
              ? Infinity
              : haversineKm(last.lat, last.lng, latitude, longitude) * 1000;
            const stale = Date.now() - last.at > 5000;
            if (!stale && movedM < 150) return;
            lastWriteRef.current = { at: Date.now(), lat: latitude, lng: longitude };
            try {
              await updateDoc(doc(db, 'serviceRequests', requestId), {
                mechanicLocation: { lat: latitude, lng: longitude },
                mechanicLocationAt: new Date(),
              });
            } catch (e) {
              console.warn('Location share failed:', e);
            }
          }
        );
        if (!cancelled) setSharingLocation(true);
      } catch (e) {
        if (!cancelled) setLocationError('Could not start location sharing');
      }
    })();

    return () => {
      cancelled = true;
      setSharingLocation(false);
      if (watchId) watchId.remove();
    };
  }, [request, requestData?.id, online]);

  const accept = async () => {
    if (requestData) {
      // Optimistic, synchronous: stops the PENDING listener from clearing
      // requestData when the accept write empties its query.
      updateRequest("accepted");
      setJobStatus("accepted");
      await updateDoc(doc(db, 'serviceRequests', requestData.id), {
          status: 'ACCEPTED',
          mechanicId: auth.currentUser?.uid || 'guest-mech'
      });
    }
  };

  const decline = () => {
    updateRequest(null);
    setRequestData(null);
  };

  const advance = async () => {
    if (!requestData) return;
    const order = ["accepted", "enroute", "arrived", "done"];
    const statusMap = { "accepted": "ACCEPTED", "enroute": "ENROUTE", "arrived": "ARRIVED", "done": "DONE" };
    const idx = order.indexOf(jobStatus);
    if (idx < order.length - 1) {
      const nextJobStatus = order[idx + 1];
      setJobStatus(nextJobStatus);
      
      await updateDoc(doc(db, 'serviceRequests', requestData.id), {
          status: statusMap[nextJobStatus]
      });
      
      if (nextJobStatus === "done") {
        setTimeout(() => {
          updateRequest(null);
          setJobStatus("accepted");
          setRequestData(null);
        }, 2200);
      }
    }
  };

  return (
    <View style={styles.container}>
      <ConnectivityBanner />
      <View style={styles.header}>
        <View>
          <Text style={styles.shopName}>{shopName}</Text>
          <Text style={styles.shopLocation}>{mechanicName}</Text>
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => setOnline(!online)}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: online ? theme.greenDim : theme.surfaceAlt,
                borderColor: online ? theme.green : theme.border,
              }
            ]}
          >
            <View style={[styles.indicator, { backgroundColor: online ? theme.green : theme.textFaint }]} />
            <Text style={[styles.toggleText, { color: online ? theme.green : theme.textMuted }]}>
              {online ? "Online" : "Offline"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => signOut(auth).catch((e) => console.warn('Sign out failed:', e))}
            style={styles.signOutBtn}
          >
            <LogOut size={15} color={theme.textFaint} />
          </TouchableOpacity>
        </View>
      </View>

      {!request && (
        <View style={styles.centerContainer}>
          <MapPin size={30} color={theme.textFaint} />
          <Text style={styles.statusText}>
            {online ? "Waiting for emergency requests nearby" : "You're offline — go online to receive requests"}
          </Text>
          
          {/* Demo Button removed; logic uses real triggers now */}
        </View>
      )}

      {request === "incoming" && (
        <View style={styles.requestContainer}>
          <View style={styles.alertBox}>
            <View style={styles.rowBetween}>
              <View style={styles.row}>
                <Siren size={16} color={theme.red} />
                <Text style={styles.alertTitle}>NEW EMERGENCY REQUEST</Text>
              </View>
              <Text style={styles.alertTitle}>ACTION REQUIRED</Text>
            </View>
            <View style={{ marginTop: 14 }}>
              <Text style={styles.issueText}>{requestData?.issueType || "Unknown issue"}</Text>
              {!!requestData?.issueDetails && (
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, marginTop: 4, marginBottom: 4 }}>
                  "{requestData.issueDetails}"
                </Text>
              )}
              <Text style={styles.issueSub}>{requestData?.vehicleInfo ? `${requestData.vehicleInfo} · ` : ''}Plate {requestData?.plate}</Text>
              <Text style={styles.issueSub}>{requestData?.location ? `GPS: ${requestData.location.lat.toFixed(4)}, ${requestData.location.lng.toFixed(4)}` : 'Location active'}</Text>
              {requestData?.contactNumber && (
                <Text style={styles.issueSub}>Contact: {requestData.contactNumber}</Text>
              )}
              {requestData?.imageUrl && (
                <Image source={{ uri: requestData.imageUrl }} style={styles.requestImage} />
              )}
            </View>
          </View>

          <View style={[styles.row, { marginTop: 16, gap: 12 }]}>
            <TouchableOpacity onPress={decline} style={styles.declineBtn}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={accept} style={styles.acceptBtn}>
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {request === "accepted" && (
        <View style={styles.requestContainer}>
          <View style={styles.jobBox}>
            <View style={styles.row}>
              <CarIcon size={16} color={theme.amber} />
              <Text style={styles.jobTitle}>{requestData?.issueType || "Issue"} · {requestData?.plate}</Text>
            </View>
            {!!requestData?.vehicleInfo && (
              <View style={[styles.row, { marginTop: 4 }]}>
                <Text style={styles.jobSub}>{requestData.vehicleInfo}</Text>
              </View>
            )}
            <View style={[styles.row, { marginTop: 8 }]}>
              <MapPin size={14} color={theme.textMuted} />
              <Text style={styles.jobSub}>
                {requestData?.location ? `Customer GPS: ${requestData.location.lat.toFixed(4)}, ${requestData.location.lng.toFixed(4)}` : 'Active Route'}
                {' · '}{sharingLocation ? 'Sharing live location' : locationError || 'Location sharing off'}
              </Text>
            </View>
            {!!requestData?.contactNumber && (
              <View style={[styles.row, { marginTop: 4 }]}>
                <PhoneCall size={13} color={theme.textMuted} />
                <Text style={styles.jobSub}>{requestData.contactName ? `${requestData.contactName} · ` : ''}{requestData.contactNumber}</Text>
              </View>
            )}
            {requestData?.imageUrl && (
              <Image source={{ uri: requestData.imageUrl }} style={styles.jobImage} />
            )}
          </View>

          <View style={{ marginTop: 20 }}>
            {jobStatus === "done" ? (
              <View style={styles.doneContainer}>
                <CheckCircle2 size={32} color={theme.green} />
                <Text style={styles.doneTitle}>Job marked complete</Text>
                <Text style={styles.doneSub}>Waiting for customer rating…</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.statusLabel}>
                  CURRENT STATUS: {jobStatus === "accepted" ? "Accepted" : jobStatus === "enroute" ? "En route" : "Arrived"}
                </Text>
                
                <TouchableOpacity onPress={advance} style={styles.actionBtn}>
                  <Navigation size={16} color={theme.bg} />
                  <Text style={styles.actionText}>
                    {jobStatus === "accepted" && "Start driving to customer"}
                    {jobStatus === "enroute" && "Mark as arrived"}
                    {jobStatus === "arrived" && "Mark job complete"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.callBtn} onPress={callCustomer}>
                  <PhoneCall size={14} color={numberColor} />
                  <Text style={[styles.callText, number ? { color: numberColor } : {}]}>
                    {number ? `Call ${name || 'customer'}` : 'No contact number left'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { paddingHorizontal: 20, paddingTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shopName: { fontFamily: fonts.displayBold, fontSize: 18, color: theme.text },
  shopLocation: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 2 },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  indicator: { width: 7, height: 7, borderRadius: 4 },
  toggleText: { fontFamily: fonts.bodySemibold, fontSize: 11.5 },
  signOutBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  statusText: { fontFamily: fonts.body, fontSize: 13.5, color: theme.textMuted, marginTop: 12, textAlign: 'center' },
  demoBtn: { marginTop: 20, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.borderStrong, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  demoBtnText: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  requestContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  alertBox: { backgroundColor: theme.redDim, borderWidth: 1, borderColor: theme.red, borderRadius: 10, padding: 16, marginTop: 8 },
  alertTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: theme.text },
  issueText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: theme.text },
  issueSub: { fontFamily: fonts.body, fontSize: 12.5, color: theme.textMuted, marginTop: 2 },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  declineText: { fontFamily: fonts.body, fontSize: 13.5, color: theme.textMuted },
  acceptBtn: { flex: 1, backgroundColor: theme.green, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  acceptText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: theme.bg },
  jobBox: { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, marginTop: 8 },
  jobTitle: { fontFamily: fonts.bodySemibold, fontSize: 13.5, color: theme.text },
  jobSub: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  doneContainer: { alignItems: 'center', paddingVertical: 32 },
  doneTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, color: theme.text, marginTop: 8 },
  doneSub: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 2 },
  statusLabel: { fontFamily: fonts.bodySemibold, fontSize: 12, color: theme.textMuted, marginBottom: 8 },
  actionBtn: { backgroundColor: theme.amber, borderRadius: 8, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: theme.bg },
  callBtn: { marginTop: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  callText: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  requestImage: { width: '100%', height: 120, borderRadius: 8, marginTop: 12, backgroundColor: theme.surfaceAlt },
  jobImage: { width: '100%', height: 120, borderRadius: 8, marginTop: 12, backgroundColor: theme.raised }
});
