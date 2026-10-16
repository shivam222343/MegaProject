import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    Image, ActivityIndicator, TextInput, RefreshControl,
    Platform, useWindowDimensions, ScrollView, Linking
} from 'react-native';
import {
    Search, Award, Briefcase, MapPin, Star,
    ChevronRight, Phone, MessageSquare, Filter,
    ShieldCheck, X, Sparkles, UserCheck
} from 'lucide-react-native';
import MainLayout from '../components/layouts/MainLayout';
import { Colors, Shadows } from '../constants/theme';
import { counselorAPI } from '../services/api';

const CATEGORY_OPTIONS = ['All', 'MHTCET', 'Engineering', 'Medical', 'Pharmacy', 'Agriculture'];

const getInitials = (name) => {
    if (!name) return 'EX';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
};

const CounselorAvatar = ({ uri, name, size = 56 }) => {
    const [hasError, setHasError] = useState(false);
    const initials = getInitials(name);

    if (uri && !hasError) {
        return (
            <Image
                source={{ uri }}
                style={[styles.profileImg, { width: size, height: size }]}
                onError={() => setHasError(true)}
            />
        );
    }

    const colors = [
        { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
        { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
        { bg: '#FAF5FF', text: '#7E22CE', border: '#E9D5FF' },
        { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
        { bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8' },
    ];
    const charCode = (name || 'E').charCodeAt(0);
    const colorScheme = colors[charCode % colors.length];

    return (
        <View
            style={[
                styles.avatarFallback,
                {
                    width: size,
                    height: size,
                    backgroundColor: colorScheme.bg,
                    borderColor: colorScheme.border,
                }
            ]}
        >
            <Text style={[styles.avatarInitials, { color: colorScheme.text }]}>
                {initials}
            </Text>
        </View>
    );
};

const CounselorsScreen = ({ navigation }) => {
    const [counselors, setCounselors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    const { width } = useWindowDimensions();
    const isDesktop = width >= 1024;
    const isTablet = width >= 680 && width < 1024;
    const numColumns = isDesktop ? 3 : (isTablet ? 2 : 1);

    useEffect(() => {
        fetchCounselors();
    }, []);

    const fetchCounselors = async () => {
        try {
            const res = await counselorAPI.getAll();
            setCounselors(res.data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchCounselors();
    };

    const filteredCounselors = useMemo(() => {
        return counselors.filter(c => {
            const q = searchQuery.trim().toLowerCase();
            const nameMatch = c.name?.toLowerCase().includes(q);
            const fieldMatch = c.field?.toLowerCase().includes(q);
            const cityMatch = (c.cityName || (typeof c.location === 'string' ? c.location : ''))?.toLowerCase().includes(q);
            const matchesSearch = !q || nameMatch || fieldMatch || cityMatch;

            const matchesCategory = selectedCategory === 'All' ||
                c.field?.toLowerCase().includes(selectedCategory.toLowerCase());

            return matchesSearch && matchesCategory;
        });
    }, [counselors, searchQuery, selectedCategory]);

    const renderCard = ({ item }) => {
        const cityName = item.cityName || (typeof item.location === 'string' ? item.location : 'Maharashtra');
        const experienceText = item.experience ? `${item.experience} Exp.` : '1+ yrs Exp.';

        return (
            <TouchableOpacity
                style={[
                    styles.card,
                    {
                        maxWidth: numColumns === 3 ? '32.2%' : (numColumns === 2 ? '48.8%' : '100%'),
                        marginBottom: numColumns === 1 ? 14 : 0,
                    },
                    Platform.OS === 'web' && { cursor: 'pointer' }
                ]}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('CounselorDetail', { id: item._id })}
            >
                {/* Header: Avatar, Name, Rating, Field */}
                <View style={styles.cardHeader}>
                    <View style={styles.avatarWrapper}>
                        <CounselorAvatar uri={item.profileImage} name={item.name} size={54} />
                        <View style={styles.onlineDot} />
                    </View>

                    <View style={styles.headerInfo}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <View style={styles.ratingBadge}>
                                <Star size={11} color="#f59e0b" fill="#f59e0b" />
                                <Text style={styles.ratingText}>{item.rating || '4.8'}</Text>
                            </View>
                        </View>

                        <View style={styles.fieldBadge}>
                            <Text style={styles.fieldBadgeText} numberOfLines={1}>
                                {item.field || 'Admission Expert'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Meta details row: Experience & City */}
                <View style={styles.metaRow}>
                    <View style={styles.metaChip}>
                        <Award size={13} color="#64748b" />
                        <Text style={styles.metaChipText} numberOfLines={1}>
                            {experienceText}
                        </Text>
                    </View>
                    <View style={styles.metaChip}>
                        <MapPin size={13} color="#64748b" />
                        <Text style={styles.metaChipText} numberOfLines={1}>
                            {cityName}
                        </Text>
                    </View>
                </View>

                {/* Divider */}
                <View style={styles.cardDivider} />

                {/* Footer: Verified & Available badges, Action buttons */}
                <View style={styles.cardFooter}>
                    <View style={styles.badgesGroup}>
                        <View style={styles.verifiedTag}>
                            <ShieldCheck size={12} color="#0284c7" />
                            <Text style={styles.verifiedText}>Verified</Text>
                        </View>
                        <View style={styles.availableTag}>
                            <View style={styles.availablePulse} />
                            <Text style={styles.availableText}>Available</Text>
                        </View>
                    </View>

                    <View style={styles.actionButtonGroup}>
                        <TouchableOpacity
                            style={styles.iconBtnPhone}
                            activeOpacity={0.7}
                            onPress={(e) => {
                                e?.stopPropagation?.();
                                if (item.contactNumber) {
                                    Linking.openURL(`tel:${item.contactNumber}`);
                                } else {
                                    navigation.navigate('CounselorDetail', { id: item._id });
                                }
                            }}
                        >
                            <Phone size={15} color={Colors.primary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.iconBtnMsg}
                            activeOpacity={0.7}
                            onPress={(e) => {
                                e?.stopPropagation?.();
                                if (item.contactNumber) {
                                    const cleanPhone = item.contactNumber.replace(/[^0-9]/g, '');
                                    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
                                    Linking.openURL(`https://wa.me/${formattedPhone}`);
                                } else {
                                    navigation.navigate('CounselorDetail', { id: item._id });
                                }
                            }}
                        >
                            <MessageSquare size={15} color="#16a34a" />
                        </TouchableOpacity>

                        <View style={styles.chevronWrap}>
                            <ChevronRight size={18} color="#94a3b8" />
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <MainLayout title="Expert Counselors" noPadding>
            <View style={styles.container}>
                <View style={[styles.contentWrapper, (isDesktop || isTablet) && styles.webContentWrapper]}>
                    {/* Hero / Header info bar */}
                    <View style={styles.heroSection}>
                        <View style={styles.heroTextCol}>
                            <Text style={styles.heroTitle}>Expert Counselors</Text>
                            <Text style={styles.heroSubtitle}>
                                Connect with verified mentors for CAP rounds, college cutoffs, and branch selection.
                            </Text>
                        </View>
                        <View style={styles.statsBadge}>
                            <Sparkles size={14} color={Colors.primary} />
                            <Text style={styles.statsBadgeText}>
                                {filteredCounselors.length} {filteredCounselors.length === 1 ? 'Expert' : 'Experts'} Available
                            </Text>
                        </View>
                    </View>

                    {/* Search and Category Filter Section */}
                    <View style={styles.filterSection}>
                        <View style={styles.searchBox}>
                            <Search size={18} color="#94a3b8" />
                            <TextInput
                                placeholder="Search by name, specialty, or city..."
                                placeholderTextColor="#94a3b8"
                                style={styles.input}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                                    <X size={16} color="#94a3b8" />
                                </TouchableOpacity>
                            )}
                            <View style={styles.searchFilterBadge}>
                                <Filter size={16} color={Colors.primary} />
                            </View>
                        </View>

                        {/* Category filter pills */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.categoryScroll}
                        >
                            {CATEGORY_OPTIONS.map(cat => {
                                const isActive = selectedCategory === cat;
                                return (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[styles.categoryPill, isActive && styles.categoryPillActive]}
                                        onPress={() => setSelectedCategory(cat)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Counselors List / Grid */}
                    {loading && !refreshing ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                            <Text style={styles.loadingText}>Finding verified counselors...</Text>
                        </View>
                    ) : (
                        <FlatList
                            key={`counselors-grid-${numColumns}`}
                            data={filteredCounselors}
                            keyExtractor={item => item._id}
                            renderItem={renderCard}
                            numColumns={numColumns}
                            columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
                            contentContainerStyle={[
                                styles.listContent,
                                (isDesktop || isTablet) && styles.webListContent
                            ]}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    colors={[Colors.primary]}
                                />
                            }
                            showsVerticalScrollIndicator={false}
                            ListEmptyComponent={
                                <View style={styles.empty}>
                                    <View style={styles.emptyIconCircle}>
                                        <UserCheck size={36} color="#94a3b8" />
                                    </View>
                                    <Text style={styles.emptyTitle}>No Experts Found</Text>
                                    <Text style={styles.emptyText}>
                                        {searchQuery || selectedCategory !== 'All'
                                            ? `No counselors matched your current filters. Try searching for a different keyword or category.`
                                            : 'No counselors are available right now. Please check back later.'}
                                    </Text>
                                    {(searchQuery || selectedCategory !== 'All') && (
                                        <TouchableOpacity
                                            style={styles.resetBtn}
                                            onPress={() => {
                                                setSearchQuery('');
                                                setSelectedCategory('All');
                                            }}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={styles.resetBtnText}>Reset All Filters</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            }
                        />
                    )}
                </View>
            </View>
        </MainLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    contentWrapper: {
        flex: 1,
        width: '100%',
        paddingHorizontal: 16,
    },
    webContentWrapper: {
        maxWidth: 1240,
        alignSelf: 'center',
        paddingHorizontal: 24,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 80,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#64748b',
        fontWeight: '500',
    },

    // Hero Section
    heroSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 18,
        marginBottom: 14,
        flexWrap: 'wrap',
        gap: 12,
    },
    heroTextCol: {
        flex: 1,
        minWidth: 240,
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0f172a',
        letterSpacing: -0.3,
    },
    heroSubtitle: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 4,
        lineHeight: 18,
    },
    statsBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#eff6ff',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#bfdbfe',
    },
    statsBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.primary,
    },

    // Search and Filter Section
    filterSection: {
        marginBottom: 16,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        paddingHorizontal: 14,
        borderRadius: 14,
        height: 50,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        ...Shadows.sm,
    },
    input: {
        flex: 1,
        marginLeft: 10,
        fontSize: 14,
        color: '#1e293b',
        height: '100%',
    },
    clearBtn: {
        padding: 6,
    },
    searchFilterBadge: {
        padding: 6,
        backgroundColor: '#eff6ff',
        borderRadius: 8,
        marginLeft: 6,
    },
    categoryScroll: {
        paddingVertical: 12,
        gap: 8,
    },
    categoryPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginRight: 6,
    },
    categoryPillActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    categoryPillText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
    },
    categoryPillTextActive: {
        color: '#ffffff',
    },

    // Grid / List
    listContent: {
        paddingBottom: 40,
    },
    webListContent: {
        paddingBottom: 60,
    },
    columnWrapper: {
        gap: 16,
        justifyContent: 'flex-start',
        marginBottom: 16,
    },

    // Card Styles
    card: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        ...Shadows.sm,
        justifyContent: 'space-between',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    avatarWrapper: {
        position: 'relative',
    },
    profileImg: {
        borderRadius: 14,
        backgroundColor: '#f1f5f9',
    },
    avatarFallback: {
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    avatarInitials: {
        fontWeight: '800',
        fontSize: 17,
        letterSpacing: 0.5,
    },
    onlineDot: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#10b981',
        borderWidth: 2,
        borderColor: '#ffffff',
    },
    headerInfo: {
        flex: 1,
        marginLeft: 12,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
        gap: 6,
    },
    name: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
    },
    ratingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#fffbeb',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#fef3c7',
    },
    ratingText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#d97706',
    },
    fieldBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#f0f9ff',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        marginTop: 2,
        maxWidth: '100%',
    },
    fieldBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#0284c7',
    },

    // Meta details
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 12,
        flexWrap: 'wrap',
    },
    metaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    metaChipText: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '500',
    },

    // Divider
    cardDivider: {
        height: 1,
        backgroundColor: '#f1f5f9',
        marginVertical: 12,
    },

    // Footer & Actions
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    badgesGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    verifiedTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#f0f9ff',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 6,
    },
    verifiedText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#0284c7',
    },
    availableTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#f0fdf4',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 6,
    },
    availablePulse: {
        width: 5,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#16a34a',
    },
    availableText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#16a34a',
    },
    actionButtonGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconBtnPhone: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#eff6ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconBtnMsg: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#f0fdf4',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chevronWrap: {
        marginLeft: 2,
    },

    // Empty State
    empty: {
        marginTop: 60,
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16,
        ...Shadows.sm,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    emptyText: {
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 19,
        maxWidth: 380,
    },
    resetBtn: {
        marginTop: 18,
        paddingHorizontal: 18,
        paddingVertical: 9,
        backgroundColor: Colors.primary,
        borderRadius: 10,
    },
    resetBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '700',
    },
});

export default CounselorsScreen;

