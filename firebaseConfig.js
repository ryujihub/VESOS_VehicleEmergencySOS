import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// TODO: Replace this with your actual Firebase Project config from the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyBgYfiI6lHHUmcL1ceF_8R52cV_Ul_bLT4",
  authDomain: "ayudaauto-4010e.firebaseapp.com",
  projectId: "ayudaauto-4010e",
  storageBucket: "ayudaauto-4010e.firebasestorage.app",
  messagingSenderId: "90995546965",
  appId: "1:90995546965:web:639b332d8bf9834035eddc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and Authentication
export const db = getFirestore(app);
export const auth = getAuth(app);
