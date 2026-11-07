import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Pressable
} from 'react-native';
import { authFetch } from '../services/api';

export default function StatisticsScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    setError('');
    try {
      const res = await authFetch('statistics.php');
      setStats(res.stats);
    } catch (e) {
      setError(e.message || 'Failed to load statistics');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadStats();
      setLoading(false);
    })();
  }, [loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#9b59b6" />
        <Text style={styles.loadingText}>Calculating statistics...</Text>
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
        <Pressable onPress={onRefresh}><Text style={styles.retryText}>Retry</Text></Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9b59b6']} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
      </View>

      {/* REVENUE SECTION */}
      <Text style={styles.sectionTitle}>Financials (RWF)</Text>
      <View style={styles.grid}>
        
        {/* Total Revenue - Full Width */}
        <View style={[styles.card, { backgroundColor: '#eafaf1', borderColor: '#27ae60', minWidth: '100%' }]}>
          <Text style={styles.cardLabel}>Total Revenue</Text>
          <Text style={[styles.cardValue, { color: '#27ae60', fontSize: 26 }]}>
            {stats.revenue.total.toLocaleString()}
          </Text>
        </View>

        {/* This Month */}
        <View style={[styles.card, { backgroundColor: '#dbeafe', borderColor: '#2563eb' }]}>
          <Text style={styles.cardLabel}>This Month</Text>
          <Text style={[styles.cardValue, { color: '#2563eb' }]}>
            {stats.revenue.this_month.toLocaleString()}
          </Text>
        </View>

        {/* Last Month - NEW */}
        <View style={[styles.card, { backgroundColor: '#f3e8ff', borderColor: '#9333ea' }]}>
          <Text style={styles.cardLabel}>Last Month</Text>
          <Text style={[styles.cardValue, { color: '#9333ea' }]}>
            {(stats.revenue.last_month || 0).toLocaleString()}
          </Text>
        </View>
        
        {/* Pending Value - Full Width */}
        <View style={[styles.card, { backgroundColor: '#fef3c7', borderColor: '#d97706', minWidth: '100%' }]}>
          <Text style={styles.cardLabel}>Pending Value (Unpaid)</Text>
          <Text style={[styles.cardValue, { color: '#d97706' }]}>
            {stats.revenue.pending.toLocaleString()}
          </Text>
        </View>

      </View>

      {/* FLEET SECTION */}
      <Text style={styles.sectionTitle}>Fleet Status</Text>
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Total Fleet</Text>
          <Text style={styles.cardValue}>{stats.fleet.total}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Assigned</Text>
          <Text style={[styles.cardValue, { color: '#e74c3c' }]}>{stats.fleet.assigned}</Text>
        </View>
      </View>

      {/* PROFORMAS SECTION */}
      <Text style={styles.sectionTitle}>Proforma Breakdown</Text>
      <View style={styles.cardList}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Pending</Text>
          <Text style={[styles.rowValue, { color: '#d97706' }]}>{stats.proformas.pending || 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Approved</Text>
          <Text style={[styles.rowValue, { color: '#059669' }]}>{stats.proformas.approved || 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Confirmed</Text>
          <Text style={[styles.rowValue, { color: '#2563eb' }]}>{stats.proformas.confirmed || 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Rejected</Text>
          <Text style={[styles.rowValue, { color: '#dc2626' }]}>{stats.proformas.rejected || 0}</Text>
        </View>
      </View>

      {/* TOP CLIENTS SECTION */}
      <Text style={styles.sectionTitle}>Top Clients</Text>
      <View style={styles.cardList}>
        {stats.top_clients.length === 0 ? (
          <Text style={styles.emptyText}>No approved clients yet.</Text>
        ) : (
          stats.top_clients.map((client, idx) => (
            <View key={idx} style={styles.clientRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{idx + 1}. {client.name}</Text>
                <Text style={styles.clientCompany}>{client.company}</Text>
              </View>
              <Text style={styles.clientAmount}>{client.total_spent.toLocaleString()} RWF</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 16, paddingTop: 44 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666' },
  errorText: { color: '#c0392b', fontSize: 14, marginBottom: 12 },
  retryText: { color: '#9b59b6', fontWeight: '700' },
  
  header: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#222' },
  
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 20, marginBottom: 10 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { 
    flex: 1, minWidth: '45%', backgroundColor: '#fff', padding: 14, 
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
  },
  cardLabel: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 6 },
  cardValue: { fontSize: 20, fontWeight: '700', color: '#222' },

  cardList: { 
    backgroundColor: '#fff', borderRadius: 10, padding: 14, 
    borderWidth: 1, borderColor: '#e0e0e0',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowLabel: { fontSize: 14, color: '#444', fontWeight: '500' },
  rowValue: { fontSize: 15, fontWeight: '700' },

  clientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  clientName: { fontSize: 14, fontWeight: '600', color: '#222' },
  clientCompany: { fontSize: 12, color: '#888', marginTop: 2 },
  clientAmount: { fontSize: 14, fontWeight: '700', color: '#27ae60' },
  emptyText: { textAlign: 'center', color: '#999', paddingVertical: 10, fontStyle: 'italic' },
});