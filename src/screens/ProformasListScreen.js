import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl, TextInput, Alert
} from 'react-native';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
  pending: { bg: '#fef3c7', text: '#d97706' },
  approved: { bg: '#d1fae5', text: '#059669' },
  confirmed: { bg: '#dbeafe', text: '#2563eb' },
  rejected: { bg: '#fee2e2', text: '#dc2626' },
};

export default function ProformasListScreen({ navigation }) {
  const { signOut } = useAuth(); // Import the logout function from Context
  
  const [proformas, setProformas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const res = await authFetch('proforma_list.php');
      setProformas(res.proformas || []);
    } catch (e) {
      setError(e.message || 'Failed to load data');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  // Refresh when coming back from Detail/Create
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await signOut(); // <--- THIS TRIGGERS THE APP TO GO BACK TO LOGIN SCREEN
        },
      },
    ]);
  };

  // Filter proformas based on search text
  const filteredProformas = useMemo(() => {
    if (!search.trim()) return proformas;
    const q = search.toLowerCase();
    return proformas.filter(p => 
      (p.proforma_id && p.proforma_id.toLowerCase().includes(q)) ||
      (p.client_name && p.client_name.toLowerCase().includes(q)) ||
      (p.client_company && p.client_company.toLowerCase().includes(q))
    );
  }, [proformas, search]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#9b59b6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Proformas</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={[styles.newBtn, { backgroundColor: '#c0392b' }]} onPress={handleLogout}>
            <Text style={styles.newBtnText}>Logout</Text>
          </Pressable>
          <Pressable style={styles.newBtn} onPress={() => navigation.navigate('ProformaCreate')}>
            <Text style={styles.newBtnText}>+ New</Text>
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by client or proforma #..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadData}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : null}

      <FlatList
        data={filteredProformas}
        keyExtractor={(item, index) => `${item.rent_id}_${index}`}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9b59b6']} />}
        renderItem={({ item }) => {
          const sc = STATUS_COLORS[item.status] || { bg: '#eee', text: '#555' };
          return (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('ProformaDetail', { rentId: item.rent_id })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.proformaId}>{item.proforma_id}</Text>
                <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.badgeText, { color: sc.text }]}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.client}>{item.client_name}</Text>
              <Text style={styles.company}>{item.client_company}</Text>
              <View style={styles.row}>
                <Text style={styles.amount}>{item.amount.toLocaleString()} RWF</Text>
                <Text style={styles.date}>{item.created_at}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search ? 'No matching proformas found' : 'No proformas found'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16, 
    paddingTop: 44, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee' 
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#222' },
  newBtn: { 
    backgroundColor: '#9b59b6', 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 8 
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    backgroundColor: '#f0f2f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#222',
  },
  errorBox: { backgroundColor: '#fde8e8', padding: 12, margin: 16, borderRadius: 8 },
  errorText: { color: '#c0392b', fontSize: 13, marginBottom: 6 },
  retryText: { color: '#9b59b6', fontWeight: '700', fontSize: 13 },
  card: { 
    backgroundColor: '#fff', 
    padding: 14, 
    borderRadius: 10, 
    marginBottom: 10, 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 4 
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  proformaId: { fontWeight: '700', color: '#9b59b6', fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  client: { fontSize: 16, fontWeight: '600', color: '#222' },
  company: { fontSize: 12, color: '#888', marginBottom: 8 },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginTop: 8, 
    borderTopWidth: 1, 
    borderTopColor: '#f0f0f0', 
    paddingTop: 8 
  },
  amount: { fontSize: 14, fontWeight: '700', color: '#27ae60' },
  date: { fontSize: 11, color: '#999' },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
});