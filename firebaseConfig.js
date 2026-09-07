import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBgYfiI6lHHUmcL1ceF_8R52cV_Ul_bLT4",
  authDomain: "ayudaauto-4010e.firebaseapp.com",
  projectId: "ayudaauto-4010e",
  storageBucket: "ayudaauto-4010e.firebasestorage.app",
  messagingSenderId: "90995546965",
  appId: "1:90995546965:web:639b332d8bf9834035eddc"
};

const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and Authentication with AsyncStorage Persistence
export const db = getFirestore(app);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
