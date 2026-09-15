import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { theme, fonts } from '../theme/theme';
import { Siren } from 'lucide-react-native';

export default function LoginScreen() {
    const [role, setRole] = useState('CUSTOMER');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleEmailAuth = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Required', 'Please enter your email and password.');
            return;
        }
        setLoading(true);
        try {
            if (isRegistering) {
                const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
                // Ask Firebase to send the verification link. If this fails we still
                // create the account — the VerifyEmail screen has a resend button.
                try {
                    await sendEmailVerification(userCred.user);
                } catch (emailErr) {
                    console.warn('Verification email failed to send:', emailErr);
                }
                await setDoc(doc(db, 'users', userCred.user.uid), {
                    role: 'MECHANIC',
                    email: userCred.user.email,
                    isVerified: false,
                    createdAt: new Date(),
                }, { merge: true });
                Alert.alert(
                    'Verify your email',
                    `We sent a verification link to ${userCred.user.email}. Tap it, then come back to finish setting up your shop profile.`
                );
            } else {
                await signInWithEmailAndPassword(auth, email.trim(), password);
            }
        } catch (e) {
            Alert.alert('Authentication Failed', e.message);
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
                            onPress={() => setRole('CUSTOMER')}
                            style={[styles.roleTab, role === 'CUSTOMER' && styles.roleTabActive]}
                        >
                            <Text style={[styles.roleTabText, role === 'CUSTOMER' && styles.roleTabTextActive]}>Driver</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setRole('MECHANIC')}
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
                        <Text style={[styles.roleLabel, { textAlign: 'left' }]}>EMAIL ADDRESS</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="mechanic@email.com"
                            placeholderTextColor={theme.textFaint}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                        />

                        <Text style={[styles.roleLabel, { textAlign: 'left', marginTop: 8 }]}>PASSWORD</Text>
                        <TextInput
                            style={[styles.input, { letterSpacing: 1 }]}
                            placeholder="••••••••"
                            placeholderTextColor={theme.textFaint}
                            secureTextEntry={true}
                            value={password}
                            onChangeText={setPassword}
                        />

                        <TouchableOpacity style={styles.primaryBtn} onPress={handleEmailAuth} disabled={loading || !email || !password}>
                            {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryBtnText}>{isRegistering ? 'Register Account' : 'Login'}</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.switchBtn} onPress={() => setIsRegistering(!isRegistering)}>
                            <Text style={styles.switchBtnText}>
                                {isRegistering ? 'Already have an account? Log in' : 'No account? Register here'}
                            </Text>
                        </TouchableOpacity>
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
