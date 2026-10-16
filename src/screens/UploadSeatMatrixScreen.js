import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity,
    TextInput, ActivityIndicator, Platform
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import MainLayout from '../components/layouts/MainLayout';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Toast from '../components/ui/Toast';
import { institutionAPI, seatMatrixAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Colors, Typography, Shadows } from '../constants/theme';
import {
    Search, CheckCircle2, Building2, MapPin, Grid3X3,
    Upload, ChevronRight, Trash2
} from 'lucide-react-native';
import AdminPrivacyLock from '../components/AdminPrivacyLock';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UploadSeatMatrixScreen = ({ navigation }) => {
    const { admissionPath } = useAuth();
    const [step, setStep] = useState(1); // 1: select college, 2: view / upload
    const [institutions, setInstitutions] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedInst, setSelectedInst] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

    // Upload state
    const [selectedFile, setSelectedFile] = useState(null);
    const [examType, setExamType] = useState('MHTCET PCM');
    const [uploadYear, setUploadYear] = useState('2025');
    const [uploadRound, setUploadRound] = useState('1');
    const [uploadState, setUploadState] = useState('idle'); // idle | parsing | review | importing | done
    const [parsedColleges, setParsedColleges] = useState([]);
    const [selectedCollegesMap, setSelectedCollegesMap] = useState({});
    const [statusLogs, setStatusLogs] = useState([]);
    const [seatMatrixSummary, setSeatMatrixSummary] = useState({});

    // Seat matrix view state
    const [matrices, setMatrices] = useState([]);
    const [loadingMatrix, setLoadingMatrix] = useState(false);
    const [viewYear, setViewYear] = useState('2025');
    const [viewRound, setViewRound] = useState('1');

    const consoleScrollRef = useRef(null);

    const showToast = (message, type = 'success') => setToast({ visible: true, message, type });
    const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

    const filteredInstitutions = institutions.filter(inst => {
        const matchesQuery = inst.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inst.location?.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inst.dteCode?.toString().includes(searchQuery);
        return matchesQuery;
    });

    useEffect(() => {
        fetchInstitutions();
    }, [admissionPath]);

    useEffect(() => {
        if (selectedInst) {
            fetchMatrices();
        }
    }, [selectedInst, viewYear, viewRound]);

    const addLog = (message, type = 'info') => {
        const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
        setStatusLogs(prev => [...prev, { message, type, ts }]);
        setTimeout(() => {
            consoleScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
    };

    const fetchInstitutions = async () => {
        setLoading(true);
        try {
            const [resInst, resSummary] = await Promise.all([
                institutionAPI.getAll(admissionPath),
                seatMatrixAPI.getSummary().catch(() => ({ data: { data: {} } }))
            ]);
            setInstitutions(resInst.data || []);
            setSeatMatrixSummary(resSummary.data?.data || {});
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchMatrices = async () => {
        if (!selectedInst) return;
        setLoadingMatrix(true);
        try {
            const res = await seatMatrixAPI.getByInstitution(selectedInst._id, {
                year: viewYear, round: viewRound
            });
            setMatrices(res.data?.data || []);
        } catch (err) {
            console.error('Fetch matrix error:', err);
        } finally {
            setLoadingMatrix(false);
        }
    };

    const handleSelectCollege = (inst) => {
        setSelectedInst(inst);
        setStep(2);
        setStatusLogs([]);
        setUploadState('idle');
        setSelectedFile(null);
        setParsedColleges([]);
    };

    // ── Pick PDF ────────────────────────────────────────────────────────────
    const handlePickFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true
            });
            if (!result.canceled && result.assets?.[0]) {
                setSelectedFile(result.assets[0]);
                showToast(`Selected: ${result.assets[0].name}`, 'success');
            }
        } catch (err) {
            console.error('File picker error:', err);
        }
    };

    // ── Parse PDF via backend → ML ─────────────────────────────────────────
    const handleParsePdf = async () => {
        if (!selectedFile) {
            Alert.alert('No File', 'Please select a PDF file first.');
            return;
        }

        setUploadState('parsing');
        setStatusLogs([]);
        addLog(`📄 Uploading: ${selectedFile.name}`, 'info');

        try {
            const formData = new FormData();
            formData.append('file', {
                uri: selectedFile.uri,
                type: 'application/pdf',
                name: selectedFile.name
            });

            addLog('🤖 Sending to ML service for seat matrix extraction...', 'info');
            const res = await seatMatrixAPI.parsePdf(formData);

            if (res.data?.success) {
                const data = res.data.data;
                addLog(`✅ Extracted ${data.length} college(s) from PDF.`, 'success');
                const selMap = {};
                data.forEach((c, i) => { selMap[i] = true; });
                setSelectedCollegesMap(selMap);
                setParsedColleges(data);
                setUploadState('review');
            } else {
                addLog(`❌ ${res.data?.message || 'ML service error'}`, 'error');
                setUploadState('idle');
            }
        } catch (err) {
            addLog(`❌ Error: ${err.response?.data?.message || err.message}`, 'error');
            setUploadState('idle');
        }
    };

    // ── SSE Import ──────────────────────────────────────────────────────────
    const handleImport = async () => {
        const toImport = parsedColleges.filter((_, i) => selectedCollegesMap[i]);
        if (!toImport.length) {
            Alert.alert('No Selection', 'Please select at least one college to import.');
            return;
        }

        setUploadState('importing');
        addLog(`🚀 Importing ${toImport.length} college(s)...`, 'info');

        try {
            const token = await AsyncStorage.getItem('userToken');
            const API_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:5100/api' : 'http://localhost:5100/api';

            const response = await fetch(`${API_BASE}/seat-matrix/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    colleges: toImport,
                    examType,
                    year: parseInt(uploadYear),
                    round: parseInt(uploadRound)
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const evt = JSON.parse(line.slice(6));
                            const logType = evt.type === 'error' ? 'error' :
                                evt.type === 'warn' ? 'warn' :
                                evt.type === 'complete' || evt.type === 'college_done' ? 'success' : 'info';
                            addLog(evt.message, logType);
                            if (evt.type === 'complete') {
                                setUploadState('done');
                                fetchInstitutions(); // Refresh summary
                                fetchMatrices();
                            }
                        } catch (_) {}
                    }
                }
            }
        } catch (err) {
            addLog(`❌ Import failed: ${err.message}`, 'error');
            setUploadState('idle');
        }
    };

    // ── Delete seat matrix ──────────────────────────────────────────────────
    const handleDelete = () => {
        Alert.alert(
            'Delete Seat Matrix',
            `Delete seat matrix for ${selectedInst?.name} (Year ${viewYear}, Round ${viewRound})?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                        try {
                            await seatMatrixAPI.delete(selectedInst._id, {
                                year: viewYear, round: viewRound
                            });
                            showToast('Seat matrix deleted.', 'success');
                            fetchMatrices();
                        } catch (err) {
                            showToast('Delete failed: ' + err.message, 'error');
                        }
                    }
                }
            ]
        );
    };

    const hasData = (inst) => !!seatMatrixSummary[inst._id];
    const CATEGORIES = ['OPEN', 'SC', 'ST', 'VJ/DT', 'NTB', 'NTC', 'NTD', 'OBC', 'SEBC'];

    // ── Step 1: College selector ─────────────────────────────────────────────
    if (step === 1) {
        return (
            <AdminPrivacyLock>
                <MainLayout navigation={navigation} title="Upload Seat Matrix">
                    <Toast {...toast} onHide={hideToast} />
                    <View style={styles.container}>
                        {/* Search bar */}
                        <View style={styles.searchRow}>
                            <Search size={16} color={Colors.text.tertiary} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search by college name or DTE code..."
                                placeholderTextColor={Colors.text.tertiary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {loading ? (
                                <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
                            ) : filteredInstitutions.map((inst) => (
                                <TouchableOpacity
                                    key={inst._id}
                                    style={styles.instCard}
                                    onPress={() => handleSelectCollege(inst)}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.instLeft}>
                                        <Building2 size={18} color={Colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.instName}>{inst.name}</Text>
                                        <View style={styles.instMeta}>
                                            <MapPin size={11} color={Colors.text.tertiary} />
                                            <Text style={styles.instMetaText}>{inst.location?.city}</Text>
                                            <Text style={styles.instMetaText}> · DTE: {inst.dteCode}</Text>
                                        </View>
                                        {hasData(inst) && (
                                            <View style={styles.dataTag}>
                                                <CheckCircle2 size={10} color="#10b981" />
                                                <Text style={[styles.dataTagText, { color: '#10b981' }]}>Has Seat Matrix</Text>
                                            </View>
                                        )}
                                    </View>
                                    <ChevronRight size={16} color={Colors.text.tertiary} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </MainLayout>
            </AdminPrivacyLock>
        );
    }

    // ── Step 2: Upload & view ────────────────────────────────────────────────
    return (
        <AdminPrivacyLock>
            <MainLayout navigation={navigation} title={selectedInst?.name?.slice(0, 28) + '...' || 'Seat Matrix'}>
                <Toast {...toast} onHide={hideToast} />
                <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

                    {/* Back button */}
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                        <Text style={styles.backBtnText}>← Back to Colleges</Text>
                    </TouchableOpacity>

                    {/* ── Upload Card ── */}
                    <Card style={styles.uploadCard}>
                        <View style={styles.cardHeader}>
                            <Grid3X3 size={16} color={Colors.primary} />
                            <Text style={styles.cardTitle}>Upload Seat Matrix PDF</Text>
                        </View>

                        {/* Meta selectors */}
                        <View style={styles.metaRow}>
                            {[
                                { label: 'Exam', options: ['MHTCET PCM', 'MHTCET PCB', 'JEE'], value: examType, set: setExamType },
                                { label: 'Year', options: ['2025', '2024', '2023'], value: uploadYear, set: setUploadYear },
                                { label: 'Round', options: ['1', '2', '3'], value: uploadRound, set: setUploadRound }
                            ].map(({ label, options, value, set }) => (
                                <View key={label} style={styles.metaField}>
                                    <Text style={styles.metaLabel}>{label}</Text>
                                    <View style={styles.metaOptions}>
                                        {options.map(opt => (
                                            <TouchableOpacity
                                                key={opt}
                                                style={[styles.metaOption, value === opt && styles.metaOptionActive]}
                                                onPress={() => set(opt)}
                                            >
                                                <Text style={[styles.metaOptionText, value === opt && { color: '#fff' }]}>
                                                    {opt}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            ))}
                        </View>

                        {/* File picker */}
                        <TouchableOpacity style={[styles.dropZone, selectedFile && styles.dropZoneActive]} onPress={handlePickFile}>
                            <Upload size={22} color={selectedFile ? '#10b981' : Colors.primary} />
                            <Text style={[styles.dropText, selectedFile && { color: '#10b981' }]}>
                                {selectedFile ? selectedFile.name : 'Tap to select Seat Matrix PDF'}
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.btnRow}>
                            <TouchableOpacity
                                style={[styles.actionBtn, styles.btnPrimary, (!selectedFile || uploadState === 'parsing') && styles.btnDisabled]}
                                onPress={handleParsePdf}
                                disabled={!selectedFile || uploadState === 'parsing'}
                            >
                                {uploadState === 'parsing' ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.actionBtnText}>Extract from PDF</Text>
                                )}
                            </TouchableOpacity>

                            {uploadState === 'review' && (
                                <TouchableOpacity
                                    style={[styles.actionBtn, styles.btnSuccess]}
                                    onPress={handleImport}
                                >
                                    <Text style={styles.actionBtnText}>
                                        Import {Object.values(selectedCollegesMap).filter(Boolean).length} College(s)
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Parsed colleges checklist */}
                        {uploadState === 'review' && parsedColleges.length > 0 && (
                            <View style={styles.parseReview}>
                                <Text style={styles.parseReviewTitle}>Select colleges to import:</Text>
                                {parsedColleges.map((c, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={styles.parseItem}
                                        onPress={() => setSelectedCollegesMap(prev => ({ ...prev, [i]: !prev[i] }))}
                                    >
                                        <View style={[styles.checkbox, selectedCollegesMap[i] && styles.checkboxChecked]}>
                                            {selectedCollegesMap[i] && <CheckCircle2 size={12} color="#fff" />}
                                        </View>
                                        <Text style={styles.parseItemText}>
                                            {c.dteCode} — {c.collegeName} ({c.branches?.length || 0} branches)
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Terminal console */}
                        {statusLogs.length > 0 && (
                            <View style={styles.terminal}>
                                <View style={styles.terminalHeader}>
                                    {['#ef4444', '#f59e0b', '#10b981'].map((c, i) => (
                                        <View key={i} style={[styles.termDot, { backgroundColor: c }]} />
                                    ))}
                                    <Text style={styles.termTitle}>Seat Matrix Import Terminal</Text>
                                </View>
                                <ScrollView
                                    ref={consoleScrollRef}
                                    style={styles.termBody}
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled
                                >
                                    {statusLogs.map((log, i) => (
                                        <Text key={i} style={[styles.termLine,
                                            log.type === 'success' && { color: '#34d399' },
                                            log.type === 'error' && { color: '#f87171' },
                                            log.type === 'warn' && { color: '#fbbf24' },
                                            log.type === 'info' && { color: '#94a3b8' }
                                        ]}>
                                            [{log.ts}] {log.message}
                                        </Text>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </Card>

                    {/* ── Seat Matrix View ── */}
                    <Card style={[styles.uploadCard, { marginTop: 12 }]}>
                        <View style={[styles.cardHeader, { justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Grid3X3 size={16} color={Colors.primary} />
                                <Text style={styles.cardTitle}>Seat Matrix View</Text>
                            </View>
                            {matrices.length > 0 && (
                                <TouchableOpacity onPress={handleDelete}>
                                    <Trash2 size={16} color="#ef4444" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Year / Round filter tabs */}
                        <View style={styles.tabsRow}>
                            {['2025', '2024', '2023'].map(y => (
                                <TouchableOpacity
                                    key={y}
                                    style={[styles.tab, viewYear === y && styles.tabActive]}
                                    onPress={() => setViewYear(y)}
                                >
                                    <Text style={[styles.tabText, viewYear === y && { color: '#fff' }]}>{y}</Text>
                                </TouchableOpacity>
                            ))}
                            <View style={styles.tabSep} />
                            {['1', '2', '3'].map(r => (
                                <TouchableOpacity
                                    key={r}
                                    style={[styles.tab, viewRound === r && styles.tabActive]}
                                    onPress={() => setViewRound(r)}
                                >
                                    <Text style={[styles.tabText, viewRound === r && { color: '#fff' }]}>R{r}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {loadingMatrix ? (
                            <ActivityIndicator color={Colors.primary} style={{ margin: 24 }} />
                        ) : matrices.length === 0 ? (
                            <Text style={styles.noDataText}>No seat matrix data for Year {viewYear} · Round {viewRound}</Text>
                        ) : (
                            <>
                                {/* Vacant seats summary */}
                                <View style={styles.vacantBar}>
                                    <Text style={styles.vacantLabel}>
                                        Total Vacant CAP Seats:{' '}
                                        <Text style={styles.vacantNum}>
                                            {matrices.reduce((s, m) => s + (m.vacantCAPSeats || 0), 0)}
                                        </Text>
                                    </Text>
                                </View>

                                {/* Branch cards */}
                                <ScrollView horizontal showsHorizontalScrollIndicator>
                                    {matrices.map((m, mIdx) => (
                                        <View key={m._id || mIdx} style={styles.branchCard}>
                                            <View style={styles.branchCardHeader}>
                                                <Text style={styles.branchName}>{m.branch}</Text>
                                                {m.vacantCAPSeats > 0 && (
                                                    <View style={styles.vacantBadge}>
                                                        <Text style={styles.vacantBadgeText}>Vacant: {m.vacantCAPSeats}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={styles.branchCode}>Code: {m.choiceCode || '—'}</Text>
                                            <View style={styles.branchStatsRow}>
                                                <View style={styles.branchStat}>
                                                    <Text style={styles.branchStatNum}>{m.totalSeats || 0}</Text>
                                                    <Text style={styles.branchStatLabel}>Total</Text>
                                                </View>
                                                <View style={styles.branchStat}>
                                                    <Text style={[styles.branchStatNum, { color: '#10b981' }]}>{m.vacantCAPSeats || 0}</Text>
                                                    <Text style={styles.branchStatLabel}>Vacant</Text>
                                                </View>
                                                <View style={styles.branchStat}>
                                                    <Text style={styles.branchStatNum}>{m.ewsSeats || 0}</Text>
                                                    <Text style={styles.branchStatLabel}>EWS</Text>
                                                </View>
                                            </View>

                                            {/* Category seats summary */}
                                            {CATEGORIES.map(cat => {
                                                const stateG = (m.categorySeats || []).find(s => s.category === cat && s.gender === 'G' && s.subType === 'State Level')?.seats || 0;
                                                const stateL = (m.categorySeats || []).find(s => s.category === cat && s.gender === 'L' && s.subType === 'State Level')?.seats || 0;
                                                if (stateG === 0 && stateL === 0) return null;
                                                return (
                                                    <View key={cat} style={styles.catRow}>
                                                        <Text style={styles.catName}>{cat}</Text>
                                                        <Text style={styles.catVal}>G: {stateG} | L: {stateL}</Text>
                                                    </View>
                                                );
                                            })}

                                            {m.pwdCommonReserved > 0 && (
                                                <Text style={styles.commonReservedText}>PWD Common Reserved: {m.pwdCommonReserved}</Text>
                                            )}
                                            {m.defCommonReserved > 0 && (
                                                <Text style={styles.commonReservedText}>DEF Common Reserved: {m.defCommonReserved}</Text>
                                            )}
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                    </Card>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </MainLayout>
        </AdminPrivacyLock>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: Colors.background },
    searchRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: Colors.card, borderRadius: 10, padding: 10,
        borderWidth: 1, borderColor: Colors.border, marginBottom: 12
    },
    searchInput: { flex: 1, color: Colors.text.primary, fontSize: 14 },
    instCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.card, borderRadius: 10, padding: 12,
        marginBottom: 8, borderWidth: 1, borderColor: Colors.border
    },
    instLeft: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.primary + '15',
        alignItems: 'center', justifyContent: 'center'
    },
    instName: { fontSize: 13, fontWeight: '700', color: Colors.text.primary, lineHeight: 18 },
    instMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    instMetaText: { fontSize: 11, color: Colors.text.tertiary },
    dataTag: {
        flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
        alignSelf: 'flex-start'
    },
    dataTagText: { fontSize: 10, fontWeight: '600' },
    backBtn: { marginBottom: 12 },
    backBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
    uploadCard: { padding: 0, overflow: 'hidden' },
    cardHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border
    },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
    metaRow: { padding: 12, gap: 10 },
    metaField: { gap: 4 },
    metaLabel: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
    metaOptions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    metaOption: {
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
        backgroundColor: 'transparent'
    },
    metaOptionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    metaOptionText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '600' },
    dropZone: {
        margin: 12, padding: 20, borderRadius: 10,
        borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.primary + '50',
        alignItems: 'center', gap: 8, backgroundColor: Colors.primary + '05'
    },
    dropZoneActive: { borderColor: '#10b981', backgroundColor: '#10b98110' },
    dropText: { fontSize: 13, color: Colors.text.secondary, textAlign: 'center' },
    btnRow: { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 0 },
    actionBtn: {
        flex: 1, padding: 11, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center'
    },
    btnPrimary: { backgroundColor: Colors.primary },
    btnSuccess: { backgroundColor: '#10b981' },
    btnDisabled: { backgroundColor: Colors.text.tertiary + '50' },
    actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    parseReview: {
        margin: 12, marginTop: 0, padding: 10,
        backgroundColor: Colors.background, borderRadius: 8
    },
    parseReviewTitle: { fontSize: 12, color: Colors.text.secondary, marginBottom: 8, fontWeight: '600' },
    parseItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    checkbox: {
        width: 18, height: 18, borderRadius: 4,
        borderWidth: 2, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center'
    },
    checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    parseItemText: { fontSize: 12, color: Colors.text.secondary, flex: 1 },
    terminal: {
        margin: 12, marginTop: 0,
        backgroundColor: '#0a0a0f',
        borderRadius: 8, overflow: 'hidden'
    },
    terminalHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        padding: 8, backgroundColor: '#13131f'
    },
    termDot: { width: 8, height: 8, borderRadius: 4 },
    termTitle: { fontSize: 10, color: '#475569', marginLeft: 4 },
    termBody: { padding: 10, maxHeight: 180 },
    termLine: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 18 },
    tabsRow: {
        flexDirection: 'row', gap: 6, padding: 12, paddingBottom: 0,
        flexWrap: 'wrap', alignItems: 'center'
    },
    tab: {
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 14, borderWidth: 1, borderColor: Colors.border
    },
    tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText: { fontSize: 11, color: Colors.text.secondary, fontWeight: '600' },
    tabSep: { width: 12 },
    noDataText: {
        textAlign: 'center', color: Colors.text.tertiary,
        fontSize: 13, padding: 24
    },
    vacantBar: {
        margin: 12, padding: 10, backgroundColor: '#fef9c3',
        borderRadius: 8, borderWidth: 1, borderColor: '#ca8a04'
    },
    vacantLabel: { fontSize: 12, color: '#713f12', fontWeight: '600' },
    vacantNum: { fontSize: 16, color: '#713f12', fontWeight: '800' },
    branchCard: {
        width: 220, marginLeft: 12, marginBottom: 12,
        backgroundColor: Colors.background,
        borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
        padding: 12
    },
    branchCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
    branchName: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.text.primary },
    vacantBadge: {
        backgroundColor: '#fef9c3', borderRadius: 4,
        paddingHorizontal: 6, paddingVertical: 2
    },
    vacantBadgeText: { fontSize: 10, color: '#713f12', fontWeight: '700' },
    branchCode: { fontSize: 10, color: Colors.text.tertiary, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    branchStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
    branchStat: { alignItems: 'center' },
    branchStatNum: { fontSize: 16, fontWeight: '800', color: Colors.text.primary },
    branchStatLabel: { fontSize: 10, color: Colors.text.tertiary },
    catRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: Colors.border
    },
    catName: { fontSize: 11, color: Colors.text.secondary, fontWeight: '600' },
    catVal: { fontSize: 11, color: Colors.primary },
    commonReservedText: { fontSize: 10, color: '#7c3aed', marginTop: 4, fontStyle: 'italic' }
});

export default UploadSeatMatrixScreen;
