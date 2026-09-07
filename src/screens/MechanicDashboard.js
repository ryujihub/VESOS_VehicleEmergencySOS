import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MechanicDashboard() {
    return (
        <View style={styles.container}>
            <Text style={styles.header}>Mechanic Dashboard</Text>
            <Text>Incoming SOS requests will appear here via Real-Time Listeners.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
    header: { fontSize: 24, fontWeight: 'bold' }
});
