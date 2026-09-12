import React, { useState, useRef } from 'react';
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
    const [confirmation, setConfirmation] = useState(null);
    const [loading, setLoading] = useState(false);
    const recaptchaVerifier = useRef(null);

    const handleSendOtp = async () => {
        const formatted = phone.startsWith('0')
            ? `+63${phone.slice(1)}`
            : phone.startsWith('+') ? phone : `+63${phone}`;

        if (formatted.length < 12) {
            Alert.alert('Error', 'Please enter a valid Philippine mobile number.');
            return;
        }
        setLoading(true);
        try {
            const result = await signInWithPhoneNumber(auth, formatted, recaptchaVerifier.current);
            setConfirmation(result);
        } catch (e) {
            Alert.alert('Error sending OTP', e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) {
            Alert.alert('Error', 'Please enter the 6-digit code sent to your phone.');
            return;
        }
        setLoading(true);
        try {
            const userCred = await confirmation.confirm(otp);
            await setDoc(doc(db, 'users', userCred.user.uid), {
                role: 'MECHANIC',
                phone: userCred.user.phoneNumber,
                isVerified: true,
                createdAt: new Date(),
            }, { merge: true });
        } catch (e) {
            Alert.alert('Invalid OTP', 'The code you entered is incorrect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCustomerLogin = async () => {
        setLoading(true);
        try {
            const userCred = await signInAnonymously(auth);
            await setDoc(doc(db, 'users', userCred.user.uid), {
                role: 'CUSTOMER',
                createdAt: new Date(),
            }, { merge: true });
        } catch (e) {
            Alert.alert('Error', e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <FirebaseRecaptchaVerifierModal
                ref={recaptchaVerifier}
                firebaseConfig={firebaseConfig}
                attemptInvisibleVerification={true}
            />

            <View style={styles.logoContainer}>
                <View style={styles.row}>
                    <Siren size={28} color={theme.amber} />
                    <Text style={styles.title}>AyudaAuto</Text>
                </View>
                <Text style={styles.subtitle}>emergency roadside assistance</Text>
            </View>

            <View style={styles.formContainer}>
                <View style={[styles.roleContainer, { marginTop: 0 }]}>
                    <Text style={styles.roleLabel}>I AM A:</Text>
                    <View style={styles.roleTabs}>
                        <TouchableOpacity
                            onPress={() => { setRole('CUSTOMER'); setConfirmation(null); }}
                            style={[styles.roleTab, role === 'CUSTOMER' && styles.roleTabActive]}
                        >
                            <Text style={[styles.roleTabText, role === 'CUSTOMER' && styles.roleTabTextActive]}>Driver</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { setRole('MECHANIC'); setConfirmation(null); }}
                            style={[styles.roleTab, role === 'MECHANIC' && styles.roleTabActive]}
                        >
                            <Text style={[styles.roleTabText, role === 'MECHANIC' && styles.roleTabTextActive]}>Mechanic</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {role === 'CUSTOMER' ? (
                    <View style={{ marginTop: 12 }}>
                        <TouchableOpacity onPress={handleCustomerLogin} style={styles.primaryBtn} disabled={loading}>
                            {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryBtnText}>Continue as Guest Driver</Text>}
                        </TouchableOpacity>
                        <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 16 }]}>
                            No registration required for emergencies.
                        </Text>
                    </View>
                ) : (
                    <View style={{ marginTop: 12 }}>
                        {!confirmation ? (
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
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleSendOtp} disabled={loading || !phone}>
                                    {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryBtnText}>Send Verification Code</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={[styles.roleLabel, { textAlign: 'left' }]}>ENTER 6-DIGIT OTP</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="_ _ _ _ _ _"
                                    placeholderTextColor={theme.textFaint}
                                    keyboardType="number-pad"
                                    value={otp}
                                    onChangeText={setOtp}
                                    maxLength={6}
                                />
                                <Text style={[styles.subtitle, { marginTop: 4, marginBottom: 16 }]}>
                                    Code sent to {phone}
                                </Text>
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyOtp} disabled={loading || otp.length < 6}>
                                    {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryBtnText}>Verify & Login</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.switchBtn} onPress={() => setConfirmation(null)}>
                                    <Text style={styles.switchBtnText}>← Different number</Text>
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
        marginBottom: 16,
        letterSpacing: 4,
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
        marginTop: 10,
    },
    primaryBtnText: { fontFamily: fonts.displayBold, fontSize: 16, color: theme.bg },
    switchBtn: { marginTop: 20, alignItems: 'center' },
    switchBtnText: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
});
