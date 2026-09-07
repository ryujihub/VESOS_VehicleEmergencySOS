import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig'; 

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [role, setRole] = useState('CUSTOMER');

    const handleAuth = async () => {
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                // Save user record to Firestore
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    uid: userCredential.user.uid,
                    email,
                    role,
                    createdAt: new Date(),
                    isAvailable: role === 'MECHANIC' ? false : null
                });
            }
        } catch (error) {
            Alert.alert("Authentication Error", error.message);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>AyudaAuto</Text>

            <TextInput 
                style={styles.input} 
                placeholder="Email" 
                value={email} 
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <TextInput 
                style={styles.input} 
                placeholder="Password" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry 
            />

            {!isLogin && (
                <View style={styles.roleContainer}>
                    <Button 
                        title="Sign Up as Customer" 
                        onPress={() => setRole('CUSTOMER')} 
                        color={role === 'CUSTOMER' ? 'blue' : 'gray'} 
                    />
                    <Button 
                        title="Sign Up as Mechanic" 
                        onPress={() => setRole('MECHANIC')} 
                        color={role === 'MECHANIC' ? 'blue' : 'gray'} 
                    />
                </View>
            )}

            <View style={styles.btn}>
                <Button title={isLogin ? 'Login' : 'Sign Up'} onPress={handleAuth} />
            </View>

            <Button 
                title={isLogin ? "Need an account? Sign up" : "Already have an account? Login"} 
                onPress={() => setIsLogin(!isLogin)} 
                type="clear"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, justifyContent: 'center' },
    title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40 },
    input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 20, borderRadius: 5 },
    roleContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
    btn: { marginBottom: 20 }
});
