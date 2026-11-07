import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { authFetch } from '../services/api';

const BUS_TYPES = [
  { key: 'coaster', name: 'Coaster', capacity: 29, base_price: 150000 },
  { key: 'coach1',  name: 'Coach-1', capacity: 35, base_price: 180000 },
  { key: 'coach2',  name: 'Coach-2', capacity: 44, base_price: 220000 },
  { key: 'yutong',  name: 'Yutong',  capacity: 56, base_price: 280000 },
];

const getTodayString = () => new Date().toISOString().slice(0, 10);
const formatDate = (dateObj) => dateObj.toISOString().slice(0, 10);
const formatTime = (dateObj) => {
  const h = String(dateObj.getHours()).padStart(2, '0');
  const m = String(dateObj.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

function newBusItem() {
  const today = getTodayString();
  return {
    id: Date.now() + Math.random(),
    bus_type: 'coaster',
    quantity: 1,
    pickup_location: '',
    dropoff_location: '',
    start_date: today,
    end_date: today,
    departure_time: '08:00',
    return_time: '17:00',
    number_of_passengers: 29,
    price_per_day: 150000,
    custom_price: '',
  };
}

function calculateDays(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return days < 1 ? 1 : days;
}

export default function ProformaCreateScreen({ navigation }) {
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientsError, setClientsError] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  // --- Add Client Modal State ---
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ 
    fname: '', lname: '', company: '', phone: '', email: '', tin: '', home_address: '' 
  });
  const [savingClient, setSavingClient] = useState(false);

  const clientDebounce = useRef(null);
  const clientReqSeq = useRef(0);

  const [notes, setNotes] = useState('');
  const [busItems, setBusItems] = useState([newBusItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [pickerConfig, setPickerConfig] = useState(null); 

  const handleValueChange = (event, selectedValue) => {
    const config = pickerConfig;
    setPickerConfig(null);
    if (!selectedValue) return;
    const formattedValue = config.mode === 'date' ? formatDate(selectedValue) : formatTime(selectedValue);
    updateItem(config.itemId, { [config.field]: formattedValue });
  };

  const handleDismiss = () => setPickerConfig(null);

  useEffect(() => {
    if (!showClientPicker) return;
    if (clientDebounce.current) clearTimeout(clientDebounce.current);
    
    clientDebounce.current = setTimeout(async () => {
      const seq = ++clientReqSeq.current;
      setLoadingClients(true);
      setClientsError('');
      try {
        const qs = new URLSearchParams();
        if (clientSearch.trim()) qs.set('search', clientSearch.trim());
        const res = await authFetch(`rental_clients.php?${qs}`);
        if (seq !== clientReqSeq.current) return;
        setClientResults(res.clients || []);
      } catch (e) {
        if (seq === clientReqSeq.current) setClientsError(e.message || 'Failed to load clients');
      } finally {
        if (seq === clientReqSeq.current) setLoadingClients(false);
      }
    }, 300);

    return () => { if (clientDebounce.current) clearTimeout(clientDebounce.current); };
  }, [clientSearch, showClientPicker]);

  const updateItem = (id, updates) => {
    setBusItems(items => items.map(it => it.id === id ? { ...it, ...updates } : it));
  };

  const addBus = () => setBusItems(items => [...items, newBusItem()]);

  const removeBus = (id) => {
    if (busItems.length === 1) {
      Alert.alert('Cannot remove', 'At least one bus item required');
      return;
    }
    setBusItems(items => items.filter(it => it.id !== id));
  };

  // --- Save Client Function ---
  const handleSaveClient = async () => {
    // Basic client-side validation matching the API
    if (!newClientForm.fname || !newClientForm.lname || !newClientForm.company || !newClientForm.phone || !newClientForm.email || !newClientForm.home_address) {
      Alert.alert('Required Fields', 'Please fill in all fields marked with *');
      return;
    }

    setSavingClient(true);
    try {
      const res = await authFetch('rental_client_create.php', {
        method: 'POST',
        body: JSON.stringify(newClientForm)
      });
      if (res.success) {
        setSelectedClient(res.client);
        setShowAddClient(false);
        setShowClientPicker(false);
        setNewClientForm({ fname: '', lname: '', company: '', phone: '', email: '', tin: '', home_address: '' });
        Alert.alert('Success', 'Client added and selected!');
      } else {
        Alert.alert('Failed', res.message);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingClient(false);
    }
  };

  const totals = useMemo(() => {
    let totalBuses = 0, totalPassengers = 0, grandTotal = 0;
    busItems.forEach(item => {
      const days = calculateDays(item.start_date, item.end_date);
      const pricePerDay = item.custom_price ? parseFloat(item.custom_price) || 0 : (BUS_TYPES.find(t => t.key === item.bus_type)?.base_price || 0);
      const qty = parseInt(item.quantity) || 1;
      totalBuses += qty;
      totalPassengers += (parseInt(item.number_of_passengers) || 0) * qty;
      grandTotal += qty * pricePerDay * days;
    });
    return { totalBuses, totalPassengers, grandTotal };
  }, [busItems]);

  const handleSubmit = async () => {
    setError('');
    if (!selectedClient) { setError('Please select a client'); return; }
    if (busItems.length === 0) { setError('Add at least one bus'); return; }

    for (let i = 0; i < busItems.length; i++) {
      const item = busItems[i];
      if (!item.pickup_location.trim())  { setError(`Item #${i + 1}: pickup required`); return; }
      if (!item.dropoff_location.trim()) { setError(`Item #${i + 1}: dropoff required`); return; }
    }

    const payload = busItems.map(item => {
      const days = calculateDays(item.start_date, item.end_date);
      const pricePerDay = item.custom_price ? parseFloat(item.custom_price) || 0 : (BUS_TYPES.find(t => t.key === item.bus_type)?.base_price || 0);
      const qty = parseInt(item.quantity) || 1;
      return {
        bus_type: item.bus_type,
        quantity: qty,
        pickup_location: item.pickup_location.trim(),
        dropoff_location: item.dropoff_location.trim(),
        start_date: item.start_date,
        end_date: item.end_date,
        departure_time: item.departure_time,
        return_time: item.return_time,
        number_of_passengers: parseInt(item.number_of_passengers) || 0,
        price_per_day: pricePerDay,
        total_days: days,
        total_price: qty * pricePerDay * days,
      };
    });

    setSubmitting(true);
    try {
      const res = await authFetch('proforma_create.php', {
        method: 'POST',
        body: JSON.stringify({ client_id: selectedClient.id, notes: notes.trim(), bus_items: payload }),
      });

      if (res.success) {
        const newId = res.rent_id ?? res.request_id ?? res.id ?? res.proforma_id;
        Alert.alert('Proforma Created', `${res.proforma_id || newId}\n${res.total_buses || 0} bus(es) · ${(res.total_amount || 0).toLocaleString()} RWF`,
          [{ text: 'OK', onPress: () => navigation.replace('ProformaDetail', { rentId: Number(newId) }) }]
        );
      } else {
        setError(res.message || 'Failed to create proforma');
      }
    } catch (e) {
      setError(e.message || 'Cannot reach server');
    } finally {
      setSubmitting(false);
    }
  };

  const selectClient = (c) => {
    setSelectedClient(c);
    setShowClientPicker(false);
    setClientSearch('');
    setClientResults([]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}><Text style={styles.backText}>Back</Text></Pressable>
          <Text style={styles.title}>New Proforma</Text>
          <View style={{ width: 60 }} />
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        {/* CLIENT SELECTOR WITH NEW BUTTON */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <Text style={styles.label}>Client *</Text>
          <Pressable onPress={() => setShowAddClient(true)}>
            <Text style={{ color: '#9b59b6', fontWeight: '700', fontSize: 13 }}>+ New Client</Text>
          </Pressable>
        </View>

        <Pressable style={styles.selector} onPress={() => setShowClientPicker(v => !v)}>
          <Text style={selectedClient ? styles.selectorText : styles.placeholder}>
            {selectedClient ? `${selectedClient.fname} ${selectedClient.lname}${selectedClient.company && selectedClient.company !== '-' ? ' - ' + selectedClient.company : ''}` : 'Select client'}
          </Text>
          <Text style={styles.arrow}>{showClientPicker ? '▲' : '▼'}</Text>
        </Pressable>

        {showClientPicker && (
          <View style={styles.pickerBox}>
            <TextInput style={styles.searchInput} placeholder="Search by name, company, phone..." placeholderTextColor="#999" value={clientSearch} onChangeText={setClientSearch} autoCorrect={false} autoCapitalize="none" />
            {clientsError ? <Text style={styles.emptyText}>{clientsError}</Text> : loadingClients ? (
              <View style={styles.pickerLoading}><ActivityIndicator color="#9b59b6" /></View>
            ) : clientResults.length === 0 ? (
              <Text style={styles.emptyText}>{clientSearch.trim() ? 'No match' : 'Type to search clients'}</Text>
            ) : (
              <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {clientResults.map(c => (
                  <Pressable key={c.id} style={[styles.pickerItem, selectedClient?.id === c.id && styles.pickerItemActive]} onPress={() => selectClient(c)}>
                    <Text style={[styles.pickerItemText, selectedClient?.id === c.id && styles.pickerItemTextActive]}>{c.fname} {c.lname}</Text>
                    <Text style={styles.pickerItemSub}>{[c.company, c.phone].filter(v => v && v !== '-').join(' · ') || '-'}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Additional notes..." placeholderTextColor="#999" value={notes} onChangeText={setNotes} multiline />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Bus Items ({busItems.length})</Text>
          <Pressable style={styles.addBtnSmall} onPress={addBus}><Text style={styles.addBtnSmallText}>+ Add Bus</Text></Pressable>
        </View>

        {busItems.map((item, idx) => {
          const days = calculateDays(item.start_date, item.end_date);
          const pricePerDay = item.custom_price ? parseFloat(item.custom_price) || 0 : (BUS_TYPES.find(t => t.key === item.bus_type)?.base_price || 0);
          const total = (parseInt(item.quantity) || 1) * pricePerDay * days;

          return (
            <View key={item.id} style={styles.busCard}>
              <View style={styles.busCardHeader}>
                <Text style={styles.busCardTitle}>Bus #{idx + 1}</Text>
                <Pressable onPress={() => removeBus(item.id)}><Text style={styles.removeText}>Remove</Text></Pressable>
              </View>

              <Text style={styles.busLabel}>Bus Type</Text>
              <View style={styles.busTypeRow}>
                {BUS_TYPES.map(bt => (
                  <Pressable key={bt.key} style={[styles.busTypeBtn, item.bus_type === bt.key && styles.busTypeBtnActive]} onPress={() => updateItem(item.id, { bus_type: bt.key, number_of_passengers: bt.capacity, price_per_day: bt.base_price })}>
                    <Text style={[styles.busTypeText, item.bus_type === bt.key && styles.busTypeTextActive]}>{bt.name}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.busLabel}>Quantity</Text>
                  <View style={styles.qtyRow}>
                    <Pressable style={styles.qtyBtn} onPress={() => updateItem(item.id, { quantity: Math.max(1, (parseInt(item.quantity) || 1) - 1) })}><Text style={styles.qtyBtnText}>-</Text></Pressable>
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <Pressable style={styles.qtyBtn} onPress={() => updateItem(item.id, { quantity: Math.min(99, (parseInt(item.quantity) || 1) + 1) })}><Text style={styles.qtyBtnText}>+</Text></Pressable>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.busLabel}>Passengers/Bus</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={String(item.number_of_passengers)} onChangeText={v => updateItem(item.id, { number_of_passengers: v })} />
                </View>
              </View>

              <Text style={styles.busLabel}>Pickup Location *</Text>
              <TextInput style={styles.input} placeholder="e.g. Kigali" placeholderTextColor="#999" value={item.pickup_location} onChangeText={v => updateItem(item.id, { pickup_location: v })} />

              <Text style={styles.busLabel}>Dropoff Location *</Text>
              <TextInput style={styles.input} placeholder="e.g. Musanze" placeholderTextColor="#999" value={item.dropoff_location} onChangeText={v => updateItem(item.id, { dropoff_location: v })} />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.busLabel}>Start Date</Text>
                  <Pressable style={styles.pickerInput} onPress={() => setPickerConfig({ itemId: item.id, field: 'start_date', mode: 'date' })}>
                    <Text style={styles.pickerInputText}>{item.start_date}</Text><Text style={{ fontSize: 16 }}>📅</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.busLabel}>End Date</Text>
                  <Pressable style={styles.pickerInput} onPress={() => setPickerConfig({ itemId: item.id, field: 'end_date', mode: 'date' })}>
                    <Text style={styles.pickerInputText}>{item.end_date}</Text><Text style={{ fontSize: 16 }}>📅</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.busLabel}>Departure Time</Text>
                  <Pressable style={styles.pickerInput} onPress={() => setPickerConfig({ itemId: item.id, field: 'departure_time', mode: 'time' })}>
                    <Text style={styles.pickerInputText}>{item.departure_time}</Text><Text style={{ fontSize: 16 }}>⏰</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.busLabel}>Return Time</Text>
                  <Pressable style={styles.pickerInput} onPress={() => setPickerConfig({ itemId: item.id, field: 'return_time', mode: 'time' })}>
                    <Text style={styles.pickerInputText}>{item.return_time}</Text><Text style={{ fontSize: 16 }}>⏰</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.busLabel}>Custom Price/Day</Text>
              <TextInput style={styles.input} placeholder={`${(BUS_TYPES.find(t => t.key === item.bus_type)?.base_price || 0).toLocaleString()} RWF`} placeholderTextColor="#999" keyboardType="numeric" value={String(item.custom_price || '')} onChangeText={v => updateItem(item.id, { custom_price: v })} />

              <View style={styles.itemTotal}>
                <Text style={styles.itemTotalLabel}>{days} day(s) × {item.quantity} bus(es)</Text>
                <Text style={styles.itemTotalValue}>{total.toLocaleString()} RWF</Text>
              </View>
            </View>
          );
        })}

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>PROFORMA TOTAL</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Buses</Text><Text style={styles.summaryValue}>{totals.totalBuses}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Passengers</Text><Text style={styles.summaryValue}>{totals.totalPassengers}</Text></View>
          <View style={[styles.summaryRow, styles.summaryTotalRow]}><Text style={styles.summaryTotalLabel}>Grand Total</Text><Text style={styles.summaryTotalValue}>{totals.grandTotal.toLocaleString()} RWF</Text></View>
        </View>

        <Pressable style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed, submitting && styles.disabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>CREATE PROFORMA</Text>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>

      {pickerConfig && (
        <DateTimePicker
          value={pickerConfig.mode === 'date' ? new Date(busItems.find(i => i.id === pickerConfig.itemId)[pickerConfig.field]) : new Date(`1970-01-01T${busItems.find(i => i.id === pickerConfig.itemId)[pickerConfig.field]}:00`)}
          mode={pickerConfig.mode} display="default" onValueChange={handleValueChange} onDismiss={handleDismiss}
        />
      )}

      {/* ADD CLIENT MODAL */}
      <Modal visible={showAddClient} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Client</Text>
              <Pressable onPress={() => setShowAddClient(false)} hitSlop={10}><Text style={styles.modalClose}>X</Text></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.busLabel}>First Name *</Text>
              <TextInput style={styles.input} value={newClientForm.fname} onChangeText={v => setNewClientForm(p => ({ ...p, fname: v }))} placeholder="e.g. John" />
              
              <Text style={styles.busLabel}>Last Name *</Text>
              <TextInput style={styles.input} value={newClientForm.lname} onChangeText={v => setNewClientForm(p => ({ ...p, lname: v }))} placeholder="e.g. Doe" />
              
              <Text style={styles.busLabel}>Company *</Text>
              <TextInput style={styles.input} value={newClientForm.company} onChangeText={v => setNewClientForm(p => ({ ...p, company: v }))} placeholder="e.g. ABC Ltd" />
              
              <Text style={styles.busLabel}>Phone *</Text>
              <TextInput style={styles.input} value={newClientForm.phone} onChangeText={v => setNewClientForm(p => ({ ...p, phone: v }))} placeholder="e.g. 078..." keyboardType="phone-pad" />
              
              <Text style={styles.busLabel}>Email *</Text>
              <TextInput style={styles.input} value={newClientForm.email} onChangeText={v => setNewClientForm(p => ({ ...p, email: v }))} placeholder="john@example.com" keyboardType="email-address" autoCapitalize="none" />
              
              <Text style={styles.busLabel}>Home Address *</Text>
              <TextInput style={styles.input} value={newClientForm.home_address} onChangeText={v => setNewClientForm(p => ({ ...p, home_address: v }))} placeholder="e.g. Kigali, Nyarugenge" />
              
              <Text style={styles.busLabel}>TIN (Optional)</Text>
              <TextInput style={styles.input} value={newClientForm.tin} onChangeText={v => setNewClientForm(p => ({ ...p, tin: v }))} placeholder="e.g. 123456789" keyboardType="numeric" />
            </ScrollView>
            <Pressable style={[styles.modalSubmitBtn, savingClient && styles.disabled]} onPress={handleSaveClient} disabled={savingClient}>
              {savingClient ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitText}>SAVE CLIENT</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 16, paddingTop: 44 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backText: { color: '#9b59b6', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff', color: '#222' },
  selector: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' },
  selectorText: { fontSize: 15, color: '#222', fontWeight: '500', flex: 1 },
  placeholder: { fontSize: 15, color: '#999', flex: 1 },
  arrow: { fontSize: 12, color: '#888', marginLeft: 8 },
  pickerBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 4, backgroundColor: '#fff', padding: 8 },
  searchInput: { borderWidth: 1, borderColor: '#eee', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fafafa', color: '#222', marginBottom: 4 },
  pickerList: { maxHeight: 250 },
  pickerLoading: { paddingVertical: 20, alignItems: 'center' },
  pickerItem: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  pickerItemActive: { backgroundColor: '#f5e6ff' },
  pickerItemText: { fontSize: 14, color: '#333', fontWeight: '500' },
  pickerItemTextActive: { color: '#9b59b6', fontWeight: '700' },
  pickerItemSub: { fontSize: 11, color: '#999', marginTop: 2 },
  resultFooter: { textAlign: 'center', paddingVertical: 6, color: '#999', fontSize: 11, borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 4 },
  emptyText: { textAlign: 'center', padding: 12, color: '#999', fontStyle: 'italic', fontSize: 13 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  addBtnSmall: { backgroundColor: '#9b59b6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  addBtnSmallText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  busCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  busCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  busCardTitle: { fontSize: 14, fontWeight: '700', color: '#9b59b6' },
  removeText: { color: '#c0392b', fontSize: 12, fontWeight: '600' },
  busLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginTop: 8, marginBottom: 4 },
  busTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  busTypeBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  busTypeBtnActive: { backgroundColor: '#9b59b6', borderColor: '#9b59b6' },
  busTypeText: { fontSize: 12, fontWeight: '600', color: '#666' },
  busTypeTextActive: { color: '#fff' },
  row: { flexDirection: 'row' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 4 },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: '#9b59b6' },
  qtyValue: { fontSize: 15, fontWeight: '700', color: '#222', minWidth: 30, textAlign: 'center' },
  pickerInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff' },
  pickerInputText: { fontSize: 15, color: '#222' },
  itemTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  itemTotalLabel: { fontSize: 12, color: '#888' },
  itemTotalValue: { fontSize: 14, fontWeight: '700', color: '#27ae60' },
  summary: { backgroundColor: '#f5e6ff', borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#9b59b6' },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: '#9b59b6', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryLabel: { fontSize: 13, color: '#666' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: '#9b59b6', marginTop: 6, paddingTop: 8 },
  summaryTotalLabel: { fontSize: 14, fontWeight: '700', color: '#9b59b6' },
  summaryTotalValue: { fontSize: 16, fontWeight: '700', color: '#27ae60' },
  submitBtn: { backgroundColor: '#9b59b6', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  submitBtnPressed: { backgroundColor: '#7d3c98' },
  disabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  errorBox: { backgroundColor: '#fde8e8', padding: 12, borderRadius: 8, marginBottom: 12 },
  errorText: { color: '#c0392b', fontSize: 13 },
  
  // Modal Styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  modalClose: { fontSize: 20, color: '#999', fontWeight: '700' },
  modalSubmitBtn: { backgroundColor: '#27ae60', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  modalSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});