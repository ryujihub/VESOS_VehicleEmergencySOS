import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

import LoginScreen from './src/screens/LoginScreen';
import CustomerDashboard from './src/screens/CustomerDashboard';
import MechanicDashboard from './src/screens/MechanicDashboard';

const Stack = createStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for Authentication State from Firebase
    const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
      if (authenticatedUser) {
        setUser(authenticatedUser);
        try {
          // Check role (CUSTOMER vs MECHANIC)
          const userDoc = await getDoc(doc(db, 'users', authenticatedUser.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role);
          }
        } catch (e) {
          console.error("Error fetching user data:", e);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          {!user ? (
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
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
