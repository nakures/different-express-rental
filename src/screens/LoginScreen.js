import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { publicFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingBranches, setFetchingBranches] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await publicFetch('branches.php');
        if (res.success && res.branches.length > 0) {
          setBranches(res.branches);
          setSelectedBranchId(res.branches[0].id);
        } else {
          Alert.alert('Error', 'No branches found');
        }
      } catch (e) {
        Alert.alert('Error', 'Could not load branches. Check connection.');
      } finally {
        setFetchingBranches(false);
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!selectedBranchId) {
      Alert.alert('Error', 'Please select a branch');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter the password');
      return;
    }

    setLoading(true);
    try {
      const res = await publicFetch('login.php', {
        method: 'POST',
        body: JSON.stringify({ 
          branch_id: parseInt(selectedBranchId), 
          password: password.trim() 
        }),
      });

      if (res.success && res.token) {
        // Use the Context to save the token and trigger the navigation swap
        await signIn(res.token, res.user);
      } else {
        Alert.alert('Login Failed', res.message || 'Invalid credentials');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingBranches) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#9b59b6" />
        <Text style={{ marginTop: 12, color: '#666' }}>Loading branches...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Bus Rental</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <Text style={styles.label}>Select Branch</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedBranchId}
            onValueChange={(itemValue) => setSelectedBranchId(itemValue)}
            style={styles.picker}
          >
            {branches.map((b) => (
              <Picker.Item key={b.id} label={b.name} value={b.id} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={({ pressed }) => [
            styles.btn, 
            pressed && { opacity: 0.85 }, 
            loading && styles.disabled
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>LOGIN</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f7fa' },
  container: { flex: 1, backgroundColor: '#f5f7fa', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#9b59b6', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fafafa', color: '#222' },
  pickerContainer: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fafafa', overflow: 'hidden' },
  picker: { height: 50, width: '100%', color: '#222' },
  btn: { backgroundColor: '#9b59b6', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});