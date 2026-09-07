import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { auth, db } from '../../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function CustomerDashboard() {
    const [sending, setSending] = useState(false);
    
    const triggerSOS = async () => {
        setSending(true);
        try {
            // 1. Get Location
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission to access location was denied');
                setSending(false);
                return;
            }

            let location = await Location.getCurrentPositionAsync({});
            
            // 2. Try creating SOS in Firebase Native (Internet Flow)
            try {
                await addDoc(collection(db, 'serviceRequests'), {
                    customerId: auth.currentUser.uid,
                    status: 'PENDING',
                    issueType: 'CAR_BREAKDOWN', // Placeholder for form
                    location: {
                        lat: location.coords.latitude,
                        lng: location.coords.longitude
                    },
                    createdAt: serverTimestamp(),
                });
                Alert.alert("Success", "SOS Request sent to nearby mechanics!");
            } catch (firebaseErr) {
                console.log("Firebase failed, possibly offline: ", firebaseErr);
                // 3. Fallback to SMS
                Alert.alert("Poor Connection", "Sending SOS via SMS fallback.");
                const isAvailable = await SMS.isAvailableAsync();
                if (isAvailable) {
                    await SMS.sendSMSAsync(
                        ['1234567890'], // Hotline or auto SMS gateway number
                        `SOS Request! I need help. Lat: ${location.coords.latitude}, Lng: ${location.coords.longitude}`
                    );
                } else {
                    Alert.alert("Error", "SMS is not available on this device");
                }
            }

        } catch (err) {
            Alert.alert("Error", err.message);
        }
        setSending(false);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Welcome, Customer!</Text>
            
            <View style={styles.sosContainer}>
                {sending ? (
                    <ActivityIndicator size="large" color="red" />
                ) : (
                    <Button 
                        title="🔴 TAP FOR EMERGENCY SOS" 
                        onPress={triggerSOS} 
                        color="red"
                    />
                )}
            </View>
            <Text style={styles.info}>
                Pressing this will share your GPS location to nearby mechanics. 
                In low-signal areas, this will fallback to SMS.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    sosContainer: { flex: 1, justifyContent: 'center', marginVertical: 40 },
    info: { textAlign: 'center', color: '#666', marginTop: 20 }
});
