import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { theme } from './src/theme/theme';
import { onAuthStateChanged, reload } from 'firebase/auth';
import { doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

import LoginScreen from './src/screens/LoginScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import CustomerDashboard from './src/screens/CustomerDashboard';
import MechanicDashboard from './src/screens/MechanicDashboard';
import RegistrationScreen from './src/screens/RegistrationScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  // Available the instant auth resolves — no Firestore round-trip needed.
  // Anonymous (customer) users have providerId 'firebase', mechanics 'password'.
  const isEmailAuth = !!user?.providerData?.some((p) => p.providerId === 'password');

  // Keep the Firestore isVerified flag in sync with Firebase Auth's
  // emailVerified (Auth is the source of truth; the flag is for queries/rules).
  const syncVerifiedFlag = async (authUser) => {
    if (!authUser?.emailVerified || !authUser.uid) return;
    try {
      const snap = await getDoc(doc(db, 'users', authUser.uid));
      if (snap.exists() && snap.data().role === 'MECHANIC' && !snap.data().isVerified) {
        await updateDoc(doc(db, 'users', authUser.uid), { isVerified: true });
      }
    } catch (e) {
      console.warn('isVerified sync failed:', e);
    }
  };

  const [fontsLoaded] = useFonts({
    SpaceGrotesk: SpaceGrotesk_500Medium,
    SpaceGroteskBold: SpaceGrotesk_700Bold,
    Inter: Inter_400Regular,
    InterMedium: Inter_500Medium,
    InterSemibold: Inter_600SemiBold,
  });

  useEffect(() => {
    let unsubUser = () => {};
    const unsubAuth = onAuthStateChanged(auth, (authenticatedUser) => {
      unsubUser(); // clean up previous listener
      if (authenticatedUser) {
        setUser(authenticatedUser);
        setEmailVerified(!!authenticatedUser.emailVerified);
        if (authenticatedUser.emailVerified) {
          // Covers users who verified via the email link while the app was closed.
          syncVerifiedFlag(authenticatedUser);
        }
        unsubUser = onSnapshot(doc(db, 'users', authenticatedUser.uid), (snap) => {
          if (snap.exists()) {
            setRole(snap.data().role);
            setIsSetupComplete(!!snap.data().isSetupComplete);
          }
          setLoading(false);
        }, (e) => {
          console.error('User doc error:', e);
          setLoading(false);
        });
      } else {
        setUser(null);
        setRole(null);
        setIsSetupComplete(false);
        setEmailVerified(false);
        setLoading(false);
      }
    });
    return () => { unsubAuth(); unsubUser(); };
  }, []);

  // Firebase Auth only learns about a verification after the user record is
  // reloaded, so poll while an unverified email user is signed in. Verification
  // links are tapped in the mail app / browser, not in this app.
  useEffect(() => {
    if (!user || emailVerified || !isEmailAuth) return;
    const interval = setInterval(async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      try {
        await reload(currentUser);
        if (currentUser.emailVerified) {
          setEmailVerified(true);
          syncVerifiedFlag(currentUser);
        }
      } catch (e) {
        console.warn('Auth reload failed:', e);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [user, emailVerified, isEmailAuth]);

  if (loading || !fontsLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.amber} />
      </View>
    );
  }

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
    },
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator>
          {!user ? (
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          ) : !emailVerified && isEmailAuth ? (
            <Stack.Screen name="VerifyEmail" options={{ headerShown: false }}>
              {() => (
                <VerifyEmailScreen
                  onVerified={(currentUser) => {
                    setEmailVerified(true);
                    syncVerifiedFlag(currentUser);
                  }}
                />
              )}
            </Stack.Screen>
          ) : !isSetupComplete ? (
            <Stack.Screen name="Registration" options={{ headerShown: false }}>
              {() => <RegistrationScreen role={role} />}
            </Stack.Screen>
          ) : role === 'CUSTOMER' ? (
            <Stack.Screen name="CustomerDashboard" component={CustomerDashboard} options={{ title: 'Customer SOS' }} />
          ) : role === 'MECHANIC' ? (
            <Stack.Screen name="MechanicDashboard" component={MechanicDashboard} options={{ title: 'Mechanic Dashboard' }} />
          ) : (
            <Stack.Screen name="Fallback" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  }
});
