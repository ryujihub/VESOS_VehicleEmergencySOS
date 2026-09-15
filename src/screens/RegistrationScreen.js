import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, storage } from '../../firebaseConfig';
import { theme, fonts } from '../theme/theme';
import { Siren, Camera, User, Wrench, Phone, LogOut } from 'lucide-react-native';

export default function RegistrationScreen({ role }) {
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [idPhoto, setIdPhoto] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickId = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) setIdPhoto(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    if (role === 'MECHANIC' && !shopName.trim()) {
      Alert.alert('Required', 'Please enter your shop or business name.');
      return;
    }
    if (role === 'MECHANIC' && contactNumber.replace(/[^0-9]/g, '').length < 7) {
      Alert.alert('Required', 'Please enter a valid contact number so customers can reach you.');
      return;
    }

    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      let idUrl = null;

      if (idPhoto) {
        try {
          const response = await fetch(idPhoto);
          const blob = await response.blob();
          const storageRef = ref(storage, `ids/${uid}.jpg`);
          await uploadBytes(storageRef, blob);
          idUrl = await getDownloadURL(storageRef);
        } catch (e) {
          console.log('ID upload failed:', e);
        }
      }

      // setDoc+merge instead of updateDoc: if the original registration doc
      // write failed (e.g. network dropped mid-signup), this recreates it
      // instead of failing forever with "No document to update".
      await setDoc(doc(db, 'users', uid), {
        name: fullName.trim(),
        role: role || (auth.currentUser?.isAnonymous ? 'CUSTOMER' : 'MECHANIC'),
        ...(role === 'MECHANIC' && { shopName: shopName.trim(), contactNumber: contactNumber.trim() }),
        ...(idUrl && { idUrl }),
        isSetupComplete: true,
      }, { merge: true });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={[styles.row, styles.headerRow]}>
          <View style={styles.row}>
            <Siren size={22} color={theme.amber} />
            <Text style={styles.title}>AyudaAuto</Text>
          </View>
          <TouchableOpacity
            onPress={() => signOut(auth).catch((e) => console.warn('Sign out failed:', e))}
            style={styles.signOutBtn}
          >
            <LogOut size={15} color={theme.textFaint} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          {role === 'MECHANIC' ? 'Mechanic Registration' : 'Driver Registration'}
        </Text>
        <Text style={styles.desc}>
          {role === 'MECHANIC'
            ? 'Please provide your details so customers can trust and identify you.'
            : 'Just your name so mechanics know who to look for.'}
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>FULL NAME</Text>
        <View style={styles.inputRow}>
          <User size={16} color={theme.textFaint} />
          <TextInput
            style={styles.input}
            placeholder="Juan Dela Cruz"
            placeholderTextColor={theme.textFaint}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        {role === 'MECHANIC' && (
          <>
            <Text style={[styles.label, { marginTop: 20 }]}>SHOP / BUSINESS NAME</Text>
            <View style={styles.inputRow}>
              <Wrench size={16} color={theme.textFaint} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Kuya's Auto Repair"
                placeholderTextColor={theme.textFaint}
                value={shopName}
                onChangeText={setShopName}
              />
            </View>

            <Text style={[styles.label, { marginTop: 20 }]}>CONTACT NUMBER</Text>
            <View style={styles.inputRow}>
              <Phone size={16} color={theme.textFaint} />
              <TextInput
                style={styles.input}
                placeholder="0917 123 4567"
                placeholderTextColor={theme.textFaint}
                value={contactNumber}
                onChangeText={(text) => setContactNumber(text.replace(/[^0-9+ ]/g, ''))}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={[styles.label, { marginTop: 20 }]}>VALID ID / CERTIFICATION PHOTO</Text>
            <TouchableOpacity style={styles.photoBtn} onPress={pickId}>
              <Camera size={18} color={idPhoto ? theme.green : theme.textMuted} />
              <Text style={[styles.photoText, { color: idPhoto ? theme.green : theme.textMuted }]}>
                {idPhoto ? 'ID photo attached ✓' : 'Take photo of your valid ID or mechanic cert'}
              </Text>
            </TouchableOpacity>
            {idPhoto && (
              <Image source={{ uri: idPhoto }} style={styles.idPreview} />
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.btn, { opacity: loading ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={theme.bg} />
            : <Text style={styles.btnText}>Continue →</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: theme.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  headerRow: { justifyContent: 'space-between', marginBottom: 0 },
  signOutBtn: { borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 7 },
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: theme.text },
  subtitle: { fontFamily: fonts.displayBold, fontSize: 17, color: theme.amber, marginBottom: 6 },
  desc: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, lineHeight: 19 },
  form: { paddingHorizontal: 24, paddingTop: 28 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 11, color: theme.textMuted, marginBottom: 8, letterSpacing: 0.5 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: theme.text },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  photoText: { fontFamily: fonts.body, fontSize: 13 },
  idPreview: { width: '100%', height: 140, borderRadius: 8, marginTop: 12, backgroundColor: theme.raised },
  btn: {
    marginTop: 32,
    backgroundColor: theme.amber,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { fontFamily: fonts.displayBold, fontSize: 15, color: theme.bg },
});
