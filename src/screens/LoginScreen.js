import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { signInAnonymously, signInWithPhoneNumber } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { auth, db, app, firebaseConfig } from '../../firebaseConfig'; 
import { theme, fonts } from '../theme/theme';
import { Siren } from 'lucide-react-native';

export default function LoginScreen() {
    const [role, setRole] = useState('CUSTOMER');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [verificationId, setVerificationId] = useState(null);
    const recaptchaVerifier = React.useRef(null);
    const [loading, setLoading] = useState(false);

    const handleAuth = async () => {
        setLoading(true);
        try {
            if (role === 'CUSTOMER') {
                const userCred = await signInAnonymously(auth);
                await setDoc(doc(db, 'users', userCred.user.uid), {
                    role: 'CUSTOMER',
                    createdAt: new Date()
                }, { merge: true });
            } else {
                if (!verificationId) {
                    if (phone.length < 10) {
                        Alert.alert("Error", "Please enter a valid phone number.");
                        setLoading(false);
                        return;
                    }
                    const formatPhone = phone.startsWith('0') ? `+63${phone.slice(1)}` : (phone.startsWith('+') ? phone : `+63${phone}`);
                    const confirmationResult = await signInWithPhoneNumber(auth, formatPhone, recaptchaVerifier.current);
                    setVerificationId(confirmationResult);
                } else {
                    if (otp.length < 6) {
                        Alert.alert("Error", "Invalid OTP.");
                        setLoading(false);
                        return;
                    }
                    const userCred = await verificationId.confirm(otp);
                    await setDoc(doc(db, 'users', userCred.user.uid), {
                        role: 'MECHANIC',
                        phone: userCred.user.phoneNumber,
                        isVerified: true,
                        createdAt: new Date()
                    }, { merge: true });
                }
            }
        } catch (error) {
            Alert.alert("Authentication Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.logoContainer}>
                <View style={styles.row}>
                    <Siren size={28} color={theme.amber} />
                    <Text style={styles.title}>AyudaAuto</Text>
                </View>
                <Text style={styles.subtitle}>emergency roadside assistance</Text>
            </View>

            <View style={styles.formContainer}>
                
                <FirebaseRecaptchaVerifierModal
                    ref={recaptchaVerifier}
                    firebaseConfig={firebaseConfig}
                    attemptInvisibleVerification={false}
                />

                <View style={[styles.roleContainer, { marginTop: 0 }]}>
                    <Text style={styles.roleLabel}>I AM A:</Text>
                    <View style={styles.roleTabs}>
                        <TouchableOpacity 
                            onPress={() => { setRole('CUSTOMER'); setVerificationId(null); }} 
                            style={[styles.roleTab, role === 'CUSTOMER' && styles.roleTabActive]}
                        >
                            <Text style={[styles.roleTabText, role === 'CUSTOMER' && styles.roleTabTextActive]}>Driver</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => { setRole('MECHANIC'); setVerificationId(null); }} 
                            style={[styles.roleTab, role === 'MECHANIC' && styles.roleTabActive]}
                        >
                            <Text style={[styles.roleTabText, role === 'MECHANIC' && styles.roleTabTextActive]}>Mechanic</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {role === 'CUSTOMER' ? (
                    <View style={{ marginTop: 12 }}>
                        <TouchableOpacity onPress={handleAuth} style={styles.primaryBtn} disabled={loading}>
                            {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryBtnText}>Continue as Guest Driver</Text>}
                        </TouchableOpacity>
                        <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 16 }]}>
                            No registration required for emergencies.
                        </Text>
                    </View>
                ) : (
                    <View style={{ marginTop: 12 }}>
                        {!verificationId ? (
                            <>
                                <Text style={[styles.roleLabel, { textAlign: 'left' }]}>MOBILE NUMBER</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="09XX XXX XXXX"
                                    placeholderTextColor={theme.textFaint}
                                    keyboardType="phone-pad"
                                    value={phone}
                                    onChangeText={setPhone}
                                />
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth} disabled={loading || !phone}>
                                    {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryBtnText}>Send OTP Code</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={[styles.roleLabel, { textAlign: 'left' }]}>ENTER 6-DIGIT OTP</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="123456"
                                    placeholderTextColor={theme.textFaint}
                                    keyboardType="number-pad"
                                    value={otp}
                                    onChangeText={setOtp}
                                    maxLength={6}
                                />
                                <Text style={[styles.subtitle, { marginTop: 4, marginBottom: 16 }]}>Code sent via SMS</Text>
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth} disabled={loading || otp.length < 6}>
                                    {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryBtnText}>Verify & Login</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.switchBtn} onPress={() => setVerificationId(null)}>
                                    <Text style={styles.switchBtnText}>Back to Phone Number</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}

            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg, padding: 20, justifyContent: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
    logoContainer: { marginBottom: 50, alignItems: 'center' },
    title: { fontFamily: fonts.displayBold, fontSize: 32, color: theme.text, letterSpacing: 0.5 },
    subtitle: { fontFamily: fonts.body, fontSize: 13, color: theme.textFaint, marginTop: 4 },
    formContainer: { width: '100%', maxWidth: 400, alignSelf: 'center' },
    input: {
        backgroundColor: theme.surfaceAlt,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: theme.text,
        fontFamily: fonts.body,
        fontSize: 15,
        marginBottom: 16
    },
    roleContainer: { marginBottom: 24, marginTop: 8 },
    roleLabel: { fontFamily: fonts.bodySemibold, fontSize: 12, color: theme.textMuted, marginBottom: 8, textAlign: 'center' },
    roleTabs: { flexDirection: 'row', backgroundColor: theme.surface, borderRadius: 8, padding: 4 },
    roleTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
    roleTabActive: { backgroundColor: theme.raised },
    roleTabText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: theme.textMuted },
    roleTabTextActive: { color: theme.text },
    primaryBtn: {
        backgroundColor: theme.amber,
        borderRadius: 8,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 10
    },
    primaryBtnText: { fontFamily: fonts.displayBold, fontSize: 16, color: theme.bg },
    switchBtn: { marginTop: 24, alignItems: 'center' },
    switchBtnText: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted }
});
