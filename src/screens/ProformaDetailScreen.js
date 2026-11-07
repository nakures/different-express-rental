import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Alert, Modal, RefreshControl, FlatList, Linking,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { authFetch, API_BASE, getAuthToken } from '../services/api';

const STATUS_COLORS = {
  pending:   { bg: '#fef3c7', text: '#d97706' },
  approved:  { bg: '#d1fae5', text: '#059669' },
  confirmed: { bg: '#dbeafe', text: '#2563eb' },
  rejected:  { bg: '#fee2e2', text: '#dc2626' },
  cancelled: { bg: '#e2e3e5', text: '#383d41' },
};

const BUS_TYPE_NAMES = {
  coaster: 'Coaster',
  coach1:  'Coach-1',
  coach2:  'Coach-2',
  yutong:  'Yutong',
};

const FLEET_STATUS_BADGE = {
  available:   { bg: '#d1fae5', text: '#059669', label: 'Available' },
  maintenance: { bg: '#fef3c7', text: '#d97706', label: 'Maint' },
  booked:      { bg: '#fee2e2', text: '#dc2626', label: 'Booked' },
};

const splitPlates = (s) =>
  String(s || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

export default function ProformaDetailScreen({ route, navigation }) {
  const { rentId } = route.params;

  const [proforma, setProforma] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [fleet, setFleet] = useState([]);
  const [busyPlates, setBusyPlates] = useState({});
  const [assignments, setAssignments] = useState({});
  const [submittingAssign, setSubmittingAssign] = useState(false);

  const [pickerFor, setPickerFor] = useState(null);
  const [plateSearch, setPlateSearch] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const res = await authFetch(`proforma_detail.php?rent_id=${rentId}`);
      setProforma(res.proforma);
    } catch (e) {
      setError(e.message || 'Failed to load proforma');
    }
  }, [rentId]);

  useEffect(() => {
    (async () => {
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ============ PDF GENERATION (Base64 Bypass) ============
  const generatePdf = async () => {
    const token = await getAuthToken();
    if (!token) throw new Error('No token found. Please login.');

    const url = `${API_BASE}/proforma_render.php?rent_id=${rentId}&token=${encodeURIComponent(token)}`;
    if (__DEV__) console.log('[PDF] fetching:', url);

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Auth-Token': token },
    });

    if (!res.ok) {
      const peek = await res.text().catch(() => '');
      throw new Error(`Server ${res.status}: ${peek.slice(0, 300)}`);
    }

    const body = await res.text();
    if (!body.includes('invoice-content')) {
      throw new Error(`Not an invoice HTML. First chars: ${body.slice(0, 200)}`);
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>@page { size: A4; margin: 12mm; } body { margin:0; padding:0; background:#fff; }</style></head><body>${body}</body></html>`;

    const { base64 } = await Print.printToFileAsync({ html, base64: true });
    if (__DEV__) console.log('[PDF] base64 length:', base64?.length);
    if (!base64) throw new Error('PDF generation failed (no base64 returned)');

    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('No writable directory available');

    const baseName = String(proforma.proforma_id).replace(/\.pdf$/i, '');
    const safeUri = baseDir + `Proforma_${baseName}.pdf`;

    try {
      const info = await FileSystem.getInfoAsync(safeUri);
      if (info.exists) await FileSystem.deleteAsync(safeUri, { idempotent: true });
    } catch (_) {}

    await FileSystem.writeAsStringAsync(safeUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const check = await FileSystem.getInfoAsync(safeUri);
    if (__DEV__) console.log('[PDF] safe uri:', safeUri, 'exists:', check.exists, 'size:', check.size);
    if (!check.exists || !check.size) throw new Error('PDF write verification failed');

    return safeUri;
  };

  const sharePdf = async (uri, title) => {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing not available on this device');
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
      UTI: 'com.adobe.pdf',
    });
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const uri = await generatePdf();
      await sharePdf(uri, `Save Proforma_${proforma.proforma_id}.pdf`);
    } catch (e) {
      Alert.alert('Download error', e.message || String(e));
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      setSharing(true);
      const uri = await generatePdf();
      await sharePdf(uri, `Share Proforma_${proforma.proforma_id}.pdf`);
    } catch (e) {
      Alert.alert('Share error', e.message || String(e));
    } finally {
      setSharing(false);
    }
  };

  // ============ ACTIONS ============
  const handleApprove = () => {
    Alert.alert('Approve Proforma', `Approve ${proforma.proforma_id}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setActing(true);
          try {
            const res = await authFetch('proforma_approve.php', {
              method: 'POST',
              body: JSON.stringify({ rent_id: rentId, action: 'approve' }),
            });
            if (res.success) {
              const sms =
                res.sms_status === 'sent'
                  ? `\n📱 SMS sent to client (${res.sms_recipient || ''})`
                  : res.sms_status === 'skipped'
                  ? `\n📵 SMS skipped: ${res.sms_error || 'no phone'}`
                  : `\n⚠️ SMS failed: ${res.sms_error || 'unknown'}`;
              Alert.alert('Approved', 'Proforma approved' + sms);
              await loadData();
            } else {
              Alert.alert('Failed', res.message || 'Could not approve');
            }
          } catch (e) {
            Alert.alert('Error', e.message);
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  const handleReject = () => {
    Alert.prompt(
      'Reject Proforma',
      'Reason for rejection:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async (reason) => {
            if (!reason || !reason.trim()) return;
            setActing(true);
            try {
              const res = await authFetch('proforma_approve.php', {
                method: 'POST',
                body: JSON.stringify({ rent_id: rentId, action: 'reject', reason: reason.trim() }),
              });
              if (res.success) {
                Alert.alert('Rejected', 'Proforma rejected');
                await loadData();
              } else {
                Alert.alert('Failed', res.message || 'Could not reject');
              }
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setActing(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleCancel = () => {
    Alert.prompt(
      'Cancel Proforma',
      'Reason for cancellation:',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel Proforma',
          style: 'destructive',
          onPress: async (reason) => {
            if (!reason || !reason.trim()) return;
            setActing(true);
            try {
              // Calls proforma_approve.php with action='cancel'
              const res = await authFetch('proforma_approve.php', {
                method: 'POST',
                body: JSON.stringify({ rent_id: rentId, action: 'cancel', reason: reason.trim() }),
              });
              if (res.success) {
                Alert.alert('Cancelled', 'Proforma cancelled');
                await loadData();
              } else {
                Alert.alert('Failed', res.message || 'Could not cancel');
              }
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setActing(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };
  // =========================================

  const openAssignModal = async () => {
    const initial = {};
    (proforma.items || []).forEach((item) => {
      const plates = splitPlates(item.bus_plate);
      for (let i = 0; i < item.quantity; i++) {
        initial[slotKey(item.id, i)] = plates[i] || '';
      }
    });
    setAssignments(initial);
    setAssignModalOpen(true);

    try {
      const res = await authFetch(`proforma_buses.php?rent_id=${rentId}`);
      setFleet(res.fleet || []);
      const busy = {};
      (res.busy || []).forEach((p) => { busy[p] = true; });
      setBusyPlates(busy);
    } catch (e) {
      Alert.alert('Load error', e.message || 'Could not load fleet');
    }
  };

  const slotKey = (itemId, slot) => `${itemId}_${slot}`;
  const slotsForItem = (item) => Array.from({ length: item.quantity }, (_, i) => i);

  const handleAssign = async () => {
    for (const item of proforma.items) {
      for (const slot of slotsForItem(item)) {
        const plate = assignments[slotKey(item.id, slot)];
        if (!plate || !plate.trim()) {
          Alert.alert(
            'Missing plate',
            `${BUS_TYPE_NAMES[item.bus_type] || item.bus_type} slot ${slot + 1} of ${item.quantity} has no plate.`
          );
          return;
        }
      }
    }

    setSubmittingAssign(true);
    try {
      const payload = proforma.items.map((item) => {
        const plates = slotsForItem(item)
          .map((slot) => (assignments[slotKey(item.id, slot)] || '').trim())
          .filter(Boolean);
        return { item_id: item.id, bus_plate: plates.join(',') };
      });

      const res = await authFetch('proforma_assign.php', {
        method: 'POST',
        body: JSON.stringify({ rent_id: rentId, assignments: payload }),
      });

      if (res.success) {
        Alert.alert('Assigned', res.message || 'Buses assigned');
        setAssignModalOpen(false);
        await loadData();
      } else {
        Alert.alert('Failed', res.message || 'Could not assign');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingAssign(false);
    }
  };

  const visibleOptions = useMemo(() => {
    if (!pickerFor) return [];
    const { itemId, slot } = pickerFor;
    const item = proforma.items.find((i) => i.id === itemId);
    if (!item) return [];

    const currentPlate = assignments[slotKey(itemId, slot)] || '';
    const q = plateSearch.trim().toLowerCase();

    const chosenElsewhere = new Set(
      Object.entries(assignments)
        .filter(([k, v]) => k !== slotKey(itemId, slot) && v)
        .map(([, v]) => v)
    );

    return fleet
      .filter((b) => {
        if (b.plate === currentPlate) return true;
        if (busyPlates[b.plate]) return false;
        if (chosenElsewhere.has(b.plate)) return false;
        if (!q) return true;
        return (
          b.plate.toLowerCase().includes(q) ||
          String(b.bus_type || '').toLowerCase().includes(q) ||
          String(b.capacity || '').includes(q)
        );
      })
      .slice(0, 100);
  }, [pickerFor, fleet, assignments, busyPlates, plateSearch, proforma]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#9b59b6" />
        <Text style={styles.loadingText}>Loading proforma...</Text>
      </View>
    );
  }

  if (!proforma) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Proforma not found'}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.retryText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const sc = STATUS_COLORS[proforma.status] || { bg: '#eee', text: '#555' };
  const isPending = proforma.status === 'pending';
  const isApproved = proforma.status === 'approved';
  const isConfirmed = proforma.status === 'confirmed';
  const isRejected = proforma.status === 'rejected';
  const isCancelled = proforma.status === 'cancelled';
  const byName = proforma.created_by_name || proforma.prepared_by_name;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9b59b6']} />}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Proforma</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.topCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.proformaNumber}>{proforma.proforma_id}</Text>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusText, { color: sc.text }]}>
                {proforma.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.amountBig}>{proforma.amount.toLocaleString()} RWF</Text>
          {proforma.start_date && proforma.end_date ? (
            <Text style={styles.periodText}>{proforma.start_date} → {proforma.end_date}</Text>
          ) : null}
          {byName ? <Text style={styles.createdBy}>by {byName}</Text> : null}
          {proforma.notes ? <Text style={styles.notes}>{proforma.notes}</Text> : null}
        </View>

        {/* CLIENT CARD (UPDATED WITH CLICKABLE PHONE) */}
        <Text style={styles.sectionTitle}>Client</Text>
        <View style={styles.card}>
          <Text style={styles.clientName}>{proforma.client.name}</Text>
          {proforma.client.company && proforma.client.company !== '-' && (
            <Text style={styles.detailLine}>Company: {proforma.client.company}</Text>
          )}
          
          {/* NEW: Clickable Phone & WhatsApp */}
          {proforma.client.phone && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 }}>
              <Pressable 
                style={[styles.contactBtn, { backgroundColor: '#eafaf1' }]} 
                onPress={() => Linking.openURL(`tel:${proforma.client.phone}`)}
              >
                <Text style={{ color: '#27ae60', fontWeight: '700' }}>📞 Call</Text>
              </Pressable>

              <Pressable 
                style={[styles.contactBtn, { backgroundColor: '#dcfce7' }]} 
                onPress={() => {
                  const phone = String(proforma.client.phone).replace(/\D/g, '');
                  const formatted = phone.startsWith('0') ? '250' + phone.slice(1) : phone;
                  Linking.openURL(`whatsapp://send?phone=${formatted}`);
                }}
              >
                <Text style={{ color: '#25D366', fontWeight: '700' }}>WhatsApp</Text>
              </Pressable>

              <Text style={{ fontSize: 13, color: '#555' }}>{proforma.client.phone}</Text>
            </View>
          )}

          {proforma.client.email && proforma.client.email !== '-' && (
            <Text style={styles.detailLine}>Email: {proforma.client.email}</Text>
          )}
          {proforma.client.tin && (
            <Text style={styles.detailLine}>TIN: {proforma.client.tin}</Text>
          )}
          {proforma.client.address && proforma.client.address !== '-' && (
            <Text style={styles.detailLine}>Address: {proforma.client.address}</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Bus Items ({proforma.items.length})</Text>
        {proforma.items.map((item) => {
          const plates = splitPlates(item.bus_plate);
          return (
            <View key={item.id} style={styles.busCard}>
              <View style={styles.busCardHeader}>
                <Text style={styles.busCardTitle}>
                  {BUS_TYPE_NAMES[item.bus_type] || item.bus_type} × {item.quantity}
                </Text>
                <View style={[styles.itemStatusBadge, {
                  backgroundColor:
                    item.item_status === 'assigned' ? '#d1fae5' :
                    item.item_status === 'confirmed' ? '#dbeafe' : '#fef3c7',
                }]}>
                  <Text style={styles.itemStatusText}>{item.item_status}</Text>
                </View>
              </View>
              <Text style={styles.busRoute}>{item.pickup_location} → {item.dropoff_location}</Text>
              <Text style={styles.busDetail}>
                {item.start_date} to {item.end_date} ({item.total_days} day{item.total_days > 1 ? 's' : ''})
              </Text>
              <Text style={styles.busDetail}>
                Departure: {item.departure_time} · Return: {item.return_time}
              </Text>
              <Text style={styles.busDetail}>{item.number_of_passengers} passengers/bus</Text>

              {plates.length > 0 ? (
                <View style={styles.platesBox}>
                  <Text style={styles.platesLabel}>Plates ({plates.length}/{item.quantity}):</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {plates.map((p) => (
                      <View key={p} style={styles.plateChip}>
                        <Text style={styles.plateChipText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.noPlatesBox}>
                  <Text style={styles.noPlatesText}>No plates assigned yet</Text>
                </View>
              )}

              <View style={styles.busPriceRow}>
                <Text style={styles.busPriceLabel}>
                  {item.price_per_day.toLocaleString()} RWF/day
                </Text>
                <Text style={styles.busPriceValue}>
                  {item.total_price.toLocaleString()} RWF
                </Text>
              </View>
            </View>
          );
        })}

        <View style={styles.actionsSection}>
          {isPending && (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn, { backgroundColor: '#27ae60' },
                  pressed && { opacity: 0.85 }, acting && styles.disabled,
                ]}
                onPress={handleApprove}
                disabled={acting}
              >
                <Text style={styles.actionBtnText}>APPROVE</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn, { backgroundColor: '#c0392b' },
                  pressed && { opacity: 0.85 }, acting && styles.disabled,
                ]}
                onPress={handleReject}
                disabled={acting}
              >
                <Text style={styles.actionBtnText}>REJECT</Text>
              </Pressable>
            </>
          )}

          {isApproved && (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn, { backgroundColor: '#3498db' }, pressed && { opacity: 0.85 },
              ]}
              onPress={openAssignModal}
            >
              <Text style={styles.actionBtnText}>ASSIGN BUS PLATES</Text>
            </Pressable>
          )}

          {/* NEW: CANCEL BUTTON (available for pending OR approved) */}
          {(isPending || isApproved) && (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn, { backgroundColor: '#7f8c8d', marginTop: 10 }, 
                pressed && { opacity: 0.85 }, acting && styles.disabled,
              ]}
              onPress={handleCancel}
              disabled={acting}
            >
              <Text style={styles.actionBtnText}>CANCEL PROFORMA</Text>
            </Pressable>
          )}

          {(isConfirmed || isRejected || isCancelled) && (
            <View style={styles.completedBox}>
              <Text style={styles.completedText}>
                {isConfirmed ? '✅ Proforma confirmed — all buses assigned' : 
                 isRejected ? '❌ Proforma rejected' : 
                 '🚫 Proforma cancelled'}
              </Text>
            </View>
          )}

          <View style={styles.shareRow}>
            <Pressable
              style={({ pressed }) => [
                styles.shareBtn,
                { backgroundColor: '#34495e' },
                pressed && { opacity: 0.85 },
                downloading && styles.disabled,
              ]}
              onPress={handleDownload}
              disabled={downloading}
            >
              {downloading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.shareBtnText}>⬇ Save / Download</Text>}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.shareBtn,
                { backgroundColor: '#25D366' },
                pressed && { opacity: 0.85 },
                sharing && styles.disabled,
              ]}
              onPress={handleShare}
              disabled={sharing}
            >
              {sharing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.shareBtnText}>Share</Text>}
            </Pressable>
          </View>
        </View>

        {proforma.rejection_reason ? (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionLabel}>Rejection reason:</Text>
            <Text style={styles.rejectionText}>{proforma.rejection_reason}</Text>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Assignment modal */}
      <Modal visible={assignModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Bus Plates</Text>
              <Pressable onPress={() => { setAssignModalOpen(false); setPickerFor(null); }} hitSlop={10}>
                <Text style={styles.modalClose}>X</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalHint}>
                Each slot needs its own plate. Tap the picker to search by plate, bus type, or capacity.
              </Text>

              {proforma.items.map((item) => (
                <View key={item.id} style={styles.assignItem}>
                  <Text style={styles.assignItemTitle}>
                    {BUS_TYPE_NAMES[item.bus_type] || item.bus_type} × {item.quantity}
                  </Text>
                  <Text style={styles.assignItemSub}>
                    {item.pickup_location} → {item.dropoff_location} · {item.start_date}
                  </Text>

                  {slotsForItem(item).map((slot) => {
                    const key = slotKey(item.id, slot);
                    const plate = assignments[key] || '';
                    const opts = fleet.find((b) => b.plate === plate);
                    const badge = opts ? FLEET_STATUS_BADGE[opts.status] : null;
                    return (
                      <Pressable
                        key={key}
                        style={styles.slotRow}
                        onPress={() => {
                          setPlateSearch('');
                          setPickerFor({ itemId: item.id, slot });
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.slotLabel}>Slot {slot + 1} of {item.quantity}</Text>
                          {plate ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <Text style={styles.slotValue}>{plate}</Text>
                              {badge ? (
                                <View style={[styles.badgeSmall, { backgroundColor: badge.bg }]}>
                                  <Text style={[styles.badgeSmallText, { color: badge.text }]}>
                                    {badge.label}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : (
                            <Text style={styles.slotPlaceholder}>Tap to choose bus</Text>
                          )}
                        </View>
                        <Text style={styles.slotChevron}>›</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            <Pressable
              style={({ pressed }) => [
                styles.modalSubmitBtn, pressed && { opacity: 0.85 },
                submittingAssign && styles.disabled,
              ]}
              onPress={handleAssign}
              disabled={submittingAssign}
            >
              {submittingAssign
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalSubmitText}>CONFIRM ASSIGNMENT</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Plate picker */}
      <Modal visible={!!pickerFor} animationType="fade" transparent>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Bus</Text>
              <Pressable onPress={() => setPickerFor(null)} hitSlop={10}>
                <Text style={styles.modalClose}>X</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.pickerSearch}
              placeholder="Search plate, type, or capacity..."
              placeholderTextColor="#999"
              value={plateSearch}
              onChangeText={setPlateSearch}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <FlatList
              data={visibleOptions}
              keyExtractor={(b) => b.plate}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 420 }}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>No matching buses</Text>
              }
              renderItem={({ item: b }) => {
                const key = pickerFor ? slotKey(pickerFor.itemId, pickerFor.slot) : null;
                const isSelected = key && assignments[key] === b.plate;
                const badge = FLEET_STATUS_BADGE[b.status];
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.optionRow,
                      isSelected && styles.optionRowActive,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      if (!key) return;
                      setAssignments((prev) => ({ ...prev, [key]: b.plate }));
                      setPickerFor(null);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionPlate}>{b.plate}</Text>
                      <Text style={styles.optionMeta}>
                        {BUS_TYPE_NAMES[b.bus_type] || b.bus_type || '-'} · {b.capacity || 0} seats
                      </Text>
                    </View>
                    {badge ? (
                      <View style={[styles.badgeSmall, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.badgeSmallText, { color: badge.text }]}>
                          {badge.label}
                        </Text>
                      </View>
                    ) : null}
                    {isSelected ? <Text style={styles.optionCheck}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />

            {pickerFor && assignments[slotKey(pickerFor.itemId, pickerFor.slot)] ? (
              <Pressable
                style={styles.pickerClearBtn}
                onPress={() => {
                  const key = slotKey(pickerFor.itemId, pickerFor.slot);
                  setAssignments((prev) => ({ ...prev, [key]: '' }));
                  setPickerFor(null);
                }}
              >
                <Text style={styles.pickerClearText}>Clear this slot</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 16, paddingTop: 44 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f7fa', padding: 20 },
  loadingText: { marginTop: 12, color: '#666' },
  errorText: { color: '#c0392b', fontSize: 14, marginBottom: 12 },
  retryText: { color: '#9b59b6', fontWeight: '600', fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backText: { color: '#9b59b6', fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  topCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  proformaNumber: { fontSize: 15, fontWeight: '700', color: '#9b59b6' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '700' },
  amountBig: { fontSize: 24, fontWeight: '700', color: '#27ae60', marginTop: 4 },
  periodText: { fontSize: 12, color: '#666', marginTop: 4 },
  createdBy: { fontSize: 11, color: '#999', marginTop: 4, fontStyle: 'italic' },
  notes: { fontSize: 13, color: '#333', marginTop: 10, padding: 8, backgroundColor: '#f8f9fa', borderRadius: 6, fontStyle: 'italic' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  clientName: { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 4 },
  detailLine: { fontSize: 13, color: '#555', marginTop: 2 },
  contactBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  busCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  busCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  busCardTitle: { fontSize: 15, fontWeight: '700', color: '#9b59b6' },
  itemStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  itemStatusText: { fontSize: 10, fontWeight: '700', color: '#333' },
  busRoute: { fontSize: 13, fontWeight: '600', color: '#222', marginTop: 4 },
  busDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  platesBox: { marginTop: 8, padding: 8, backgroundColor: '#f0fdf4', borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#27ae60' },
  platesLabel: { fontSize: 11, fontWeight: '700', color: '#059669' },
  plateChip: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  plateChipText: { fontFamily: 'monospace', fontSize: 12, color: '#065f46', fontWeight: '700' },
  noPlatesBox: { marginTop: 8, padding: 8, backgroundColor: '#fff8e1', borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#f39c12' },
  noPlatesText: { fontSize: 11, color: '#b9770e', fontStyle: 'italic' },
  busPriceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  busPriceLabel: { fontSize: 12, color: '#666' },
  busPriceValue: { fontSize: 14, fontWeight: '700', color: '#27ae60' },
  actionsSection: { marginTop: 20 },
  actionBtn: { paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  completedBox: { backgroundColor: '#eafaf1', padding: 14, borderRadius: 10, alignItems: 'center' },
  completedText: { color: '#27ae60', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  rejectionBox: { backgroundColor: '#fde8e8', padding: 12, borderRadius: 8, marginTop: 12 },
  rejectionLabel: { fontSize: 12, fontWeight: '700', color: '#c0392b' },
  rejectionText: { fontSize: 13, color: '#721c24', marginTop: 4 },

  shareRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  shareBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  modalClose: { fontSize: 20, color: '#999', fontWeight: '700' },
  modalBody: { maxHeight: 560 },
  modalHint: { fontSize: 12, color: '#666', marginBottom: 12, fontStyle: 'italic' },
  assignItem: { backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 10 },
  assignItemTitle: { fontSize: 14, fontWeight: '700', color: '#9b59b6' },
  assignItemSub: { fontSize: 11, color: '#666', marginTop: 2, marginBottom: 8 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, marginTop: 6,
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff',
  },
  slotLabel: { fontSize: 10, color: '#888', fontWeight: '600' },
  slotValue: { fontFamily: 'monospace', fontSize: 14, color: '#222', fontWeight: '700' },
  slotPlaceholder: { fontSize: 13, color: '#999', fontStyle: 'italic', marginTop: 2 },
  slotChevron: { fontSize: 22, color: '#bbb', marginLeft: 8 },

  modalSubmitBtn: { backgroundColor: '#9b59b6', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  modalSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 },
  pickerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, maxHeight: '85%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  pickerSearch: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#fafafa', color: '#222', marginBottom: 8,
  },
  pickerEmpty: { textAlign: 'center', color: '#999', paddingVertical: 24, fontStyle: 'italic' },
  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  optionRowActive: { backgroundColor: '#f0fdf4' },
  optionPlate: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', color: '#222' },
  optionMeta: { fontSize: 11, color: '#777', marginTop: 2 },
  optionCheck: { fontSize: 16, color: '#27ae60', fontWeight: '700', marginLeft: 8 },
  pickerClearBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: '#fde8e8' },
  pickerClearText: { color: '#c0392b', fontWeight: '700', fontSize: 13 },

  badgeSmall: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeSmallText: { fontSize: 10, fontWeight: '700' },
});