import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { MailCheck, RefreshCw, LogOut, ShieldCheck } from 'lucide-react-native';
import { reload, sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { theme, fonts } from '../theme/theme';

const RESEND_COOLDOWN_S = 45;

export default function VerifyEmailScreen({ onVerified }) {
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isNewSignUp, setIsNewSignUp] = useState(false);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const tickCooldown = useCallback((seconds) => {
    clearTimers();
    setCooldown(seconds);
    for (let i = 1; i <= seconds; i++) {
      timers.current.push(setTimeout(() => setCooldown(seconds - i), i * 1000));
    }
  }, []);

  useEffect(() => {
    // Brand-new accounts hit this screen right after registration with no
    // verification email sent yet (only existing unverified logins arrive
    // with one already sent), so give them the full cooldown before allowing
    // a resend. Timers are cleaned up on unmount.
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      tickCooldown(RESEND_COOLDOWN_S);
    }
    return clearTimers;
  }, [tickCooldown]);

  const checkVerified = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || checking) return;
    setChecking(true);
    try {
      // Auth only learns about the verification after a reload of the record.
      await reload(currentUser);
      if (currentUser.emailVerified) {
        clearTimers();
        onVerified?.(currentUser);
      } else {
        Alert.alert(
          'Not verified yet',
          "We haven't seen the verification come through yet. Tap the link in your inbox, then try again."
        );
      }
    } catch (e) {
      Alert.alert('Check failed', e.message);
    } finally {
      setChecking(false);
    }
  }, [checking, onVerified]);

  const resendEmail = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || cooldown > 0) return;
    try {
      await sendEmailVerification(currentUser);
      tickCooldown(RESEND_COOLDOWN_S);
      setIsNewSignUp(false);
      Alert.alert('Sent', `A new verification link was sent to ${currentUser.email}.`);
    } catch (e) {
      if (e.code === 'auth/too-many-requests') {
        tickCooldown(60);
        Alert.alert('Too many attempts', 'Please wait a minute before requesting another email.');
      } else {
        Alert.alert('Could not send', e.message);
      }
    }
  }, [cooldown, tickCooldown]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (e) {
      Alert.alert('Sign out failed', e.message);
    }
  }, []);

  const email = auth.currentUser?.email || 'your inbox';

  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <MailCheck size={30} color={theme.amber} />
      </View>
      <Text style={styles.title}>Confirm your email</Text>
      <Text style={styles.desc}>
        We sent a verification link to <Text style={styles.emailText}>{email}</Text>. Tap it to
        activate your mechanic account, then check back here.
      </Text>

      <TouchableOpacity
        onPress={checkVerified}
        disabled={checking}
        style={[styles.primaryBtn, checking && { opacity: 0.6 }]}
      >
        {checking ? (
          <ActivityIndicator color={theme.bg} />
        ) : (
          <View style={styles.btnRow}>
            <ShieldCheck size={17} color={theme.bg} />
            <Text style={styles.primaryBtnText}>I've verified — continue</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={resendEmail}
        disabled={cooldown > 0}
        style={[styles.secondaryBtn, cooldown > 0 && { opacity: 0.5 }]}
      >
        <View style={styles.btnRow}>
          <RefreshCw size={14} color={cooldown > 0 ? theme.textFaint : theme.textMuted} />
          <Text style={[styles.secondaryBtnText, cooldown > 0 && { color: theme.textFaint }]}>
            {cooldown > 0
              ? `Resend email in ${cooldown}s`
              : isNewSignUp
                ? 'Send email again'
                : 'Resend verification email'}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
        <View style={styles.btnRow}>
          <LogOut size={14} color={theme.textFaint} />
          <Text style={styles.signOutText}>Use a different account</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.footer}>No email? Check your spam folder, or tap resend above.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 24, justifyContent: 'center' },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: theme.amberDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: theme.text, marginBottom: 8 },
  desc: { fontFamily: fonts.body, fontSize: 13.5, color: theme.textMuted, lineHeight: 20 },
  emailText: { fontFamily: fonts.bodySemibold, color: theme.text },
  primaryBtn: {
    backgroundColor: theme.amber,
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnText: { fontFamily: fonts.displayBold, fontSize: 15, color: theme.bg },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryBtnText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: theme.textMuted },
  signOutBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  signOutText: { fontFamily: fonts.body, fontSize: 13, color: theme.textFaint },
  footer: { fontFamily: fonts.body, fontSize: 12, color: theme.textFaint, textAlign: 'center', marginTop: 8 },
});
