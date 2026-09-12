import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { MapPin, Siren, Car as CarIcon, CheckCircle2, Navigation, PhoneCall } from 'lucide-react-native';
import { theme, fonts } from '../theme/theme';
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export default function MechanicDashboard() {
  const [online, setOnline] = useState(true);
  const [request, setRequest] = useState(null); // null | "incoming" | "accepted"
  const [jobStatus, setJobStatus] = useState("accepted"); // "accepted" | "enroute" | "arrived" | "done"
  const [requestData, setRequestData] = useState(null);

  useEffect(() => {
    let unsub = () => {};
    if (online) {
      const q = query(collection(db, 'serviceRequests'), where("status", "==", "PENDING"));
      unsub = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          if (request !== "accepted") {
            const reqDoc = snapshot.docs[0];
            setRequestData({ id: reqDoc.id, ...reqDoc.data() });
            setRequest("incoming");
          }
        } else {
          if (request === "incoming") {
            setRequest(null);
            setRequestData(null);
          }
        }
      });
    } else {
       if (request === "incoming") {
         setRequest(null);
         setRequestData(null);
       }
    }
    return () => unsub();
  }, [online, request]);

  const accept = async () => {
    if (requestData) {
      await updateDoc(doc(db, 'serviceRequests', requestData.id), {
          status: 'ACCEPTED',
          mechanicId: auth.currentUser?.uid || 'guest-mech'
      });
      setRequest("accepted");
      setJobStatus("accepted");
    }
  };

  const decline = () => {
    setRequest(null);
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
          setRequest(null);
          setJobStatus("accepted");
          setRequestData(null);
        }, 2200);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.shopName}>Kuya Mando's Auto Repair</Text>
          <Text style={styles.shopLocation}>Rodriguez, Rizal</Text>
        </View>
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
              <Text style={styles.jobSub}>{requestData?.location ? `GPS: ${requestData.location.lat.toFixed(4)}, ${requestData.location.lng.toFixed(4)}` : 'Active Route'} · Maps Available</Text>
            </View>
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

                <TouchableOpacity style={styles.callBtn}>
                  <PhoneCall size={14} color={theme.textMuted} />
                  <Text style={styles.callText}>Call customer</Text>
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
