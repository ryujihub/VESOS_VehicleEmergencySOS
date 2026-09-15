import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

/**
 * Push notifications for SOS alerts.
 *
 * Mechanic devices register an Expo push token which is saved on their user
 * doc (pushTokens[]). When a driver sends an SOS, the app fan-outs a push to
 * every registered mechanic token via Expo's push API — this is what makes a
 * mechanic's phone ring even when the VESOS app is closed.
 *
 * Android requires a FCM credential on the EAS project for production pushes
 * (upload a Firebase service account key: eas-cli credentials push). Without
 * it, tokens can still be issued and the code path is identical.
 */

export const ANDROID_SOS_CHANNEL_ID = 'sos-alerts';

export async function ensureAndroidSosChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_SOS_CHANNEL_ID, {
      name: 'Emergency SOS alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (e) {
    console.log('SOS channel setup failed:', e);
  }
}

// Show alerts while the app is open (foreground) — closed-app delivery is
// handled by the OS via the push services themselves.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerMechanicPush() {
  try {
    if (!Device.isDevice) {
      console.log('Push skipped: emulators have no push services');
      return null;
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      console.log('Push permission denied — SOS will only alert in-app');
      return null;
    }

    await ensureAndroidSosChannel();

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const uid = auth.currentUser?.uid;
    if (token && uid) {
      await updateDoc(doc(db, 'users', uid), {
        pushTokens: arrayUnion(token),
      }).catch((e) => console.log('Token save failed:', e));
    }
    return token;
  } catch (e) {
    console.log('Push registration failed:', e);
    return null;
  }
}

// Notify every registered mechanic device. Fire-and-forget: a push failure
// must never delay or block the SOS itself.
export async function pushSosToMechanics(sos) {
  try {
    const { getDocs, collection, query, where } = await import('firebase/firestore');
    const snap = await getDocs(
      query(collection(db, 'users'), where('role', '==', 'MECHANIC'))
    );
    const messages = [];
    snap.forEach((d) => {
      const m = d.data();
      if (!m.isVerified || !Array.isArray(m.pushTokens)) return;
      for (const token of m.pushTokens.slice(0, 5)) {
        messages.push({
          to: token,
          channelId: ANDROID_SOS_CHANNEL_ID,
          sound: 'default',
          priority: 'high',
          title: `🚨 SOS: ${sos.issueLabel}${sos.plate ? ` · ${sos.plate}` : ''}`,
          body: `${sos.vehicleInfo || 'Vehicle details unknown'} — ${sos.mapsLink}`,
        });
      }
    });
    if (messages.length === 0) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.log('SOS push fan-out failed (SOS itself unaffected):', e);
  }
}
