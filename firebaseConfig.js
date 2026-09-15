import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const firebaseConfig = {
  apiKey: "AIzaSyBgYfiI6lHHUmcL1ceF_8R52cV_Ul_bLT4",
  authDomain: "ayudaauto-4010e.firebaseapp.com",
  projectId: "ayudaauto-4010e",
  storageBucket: "ayudaauto-4010e.firebasestorage.app",
  messagingSenderId: "90995546965",
  appId: "1:90995546965:web:639b332d8bf9834035eddc"
};

export const app = initializeApp(firebaseConfig);

// Firestore cache strategy:
// - Web: persistent cache (IndexedDB), single tab forced — a queued SOS write
//   survives a tab/app kill and resumes when connectivity returns. (This is a
//   phone app in practice; multi-tab coordination only adds failure modes.)
// - Native: the JS SDK has no IndexedDB (open feature request), so fall back
//   to the memory cache. Offline safety on device comes from the SOS write
//   timeout + SMS escalation path instead.
export let db;
if (Platform.OS === 'web') {
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
    });
  } catch (e) {
    // e.g. IndexedDB unavailable in this browser context (private mode, iframe)
    console.warn('Persistent Firestore cache unavailable, using memory cache:', e);
    db = getFirestore(app);
  }
} else {
  db = getFirestore(app);
}

export const storage = getStorage(app);

export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage)
    });
