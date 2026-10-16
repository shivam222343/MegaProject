import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MainLayout from '../components/layouts/MainLayout';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { Colors, Shadows } from '../constants/theme';
import GradientBorder from '../components/ui/GradientBorder';
import { useAuth } from '../contexts/AuthContext';
import {
    Camera,
    Edit2,
    Mail,
    MapPin,
    Award,
    BookOpen,
    LogOut,
    Hash,
    Target,
    RefreshCw,
    Check,
    Settings,
    Phone,
    ChevronLeft,
    Bookmark,
    Sparkles,
    Shield,
    ChevronRight,
} from 'lucide-react-native';
import { authAPI, uploadAPI } from '../services/api';
import * as ImagePicker from 'expo-image-picker';

const ProfileScreen = ({ navigation, route }) => {
    const { user, logout, refreshUser } = useAuth();
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isDesktop = width >= 768;

    const [uploading, setUploading] = useState(null); // 'profile' | 'banner' | null
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [galleryAvatars, setGalleryAvatars] = useState([]);
    const [bannerPreview, setBannerPreview] = useState(null);
    const [profilePreview, setProfilePreview] = useState(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await logout();
        } catch (e) {
            console.error('Logout error', e);
        } finally {
            setIsLoggingOut(false);
        }
    };

    useEffect(() => {
        refreshAvatarOptions();
    }, []);

    useEffect(() => {
        if (route.params?.autoOpenEdit) {
            const path = route.params?.admissionPath;
            navigation.setParams({ autoOpenEdit: null, admissionPath: null });
            navigation.navigate('CompleteProfile', { admissionPath: path });
        }
    }, [route.params]);

    const pickImage = async (type = 'profile') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: type === 'profile' ? [1, 1] : [16, 9],
            quality: 0.7,
        });

        if (!result.canceled) {
            const uri = result.assets[0].uri;
            if (type === 'banner') setBannerPreview(uri);
            else setProfilePreview(uri);
            handleUpload(uri, type);
        }
    };

    const handleUpload = async (uri, type) => {
        setUploading(type);
        try {
            const formData = new FormData();
            const fileName = uri.split('/').pop();

            if (Platform.OS === 'web') {
                const response = await fetch(uri);
                const blob = await response.blob();
                formData.append('image', blob, fileName);
            } else {
                const fileExt = fileName.split('.').pop();
                formData.append('image', {
                    uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                    name: fileName,
                    type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
                });
            }

            const res = await uploadAPI.upload(formData);
            const imageUrl = res.data.url;

            if (type === 'profile') {
                await authAPI.updateProfile({
                    preferences: {
                        ...user.preferences,
                        avatarUrl: imageUrl,
                        avatarSeed: null,
                    },
                });
            } else {
                await authAPI.updateProfile({ bannerUrl: imageUrl });
            }

            await refreshUser();
            Alert.alert('Success', `${type === 'profile' ? 'Profile' : 'Banner'} image updated!`);
        } catch (error) {
            console.error('Upload error:', error);
            Alert.alert('Error', 'Failed to upload image. Please try again.');
        } finally {
            setUploading(null);
        }
    };

    const handleUpdateAvatar = async (url, seed) => {
        setAvatarLoading(true);
        try {
            await authAPI.updateProfile({
                preferences: {
                    ...user.preferences,
                    avatarUrl: url,
                    avatarSeed: seed,
                },
            });
            await refreshUser();
            Alert.alert('Success', 'AI Avatar updated!');
        } catch (error) {
            Alert.alert('Error', 'Failed to update avatar');
        } finally {
            setAvatarLoading(false);
        }
    };

    const handleUpdateApiKey = async () => {
        // Preserved for backwards compatibility
        try {
            Alert.alert('Info', 'API key management is available in Settings.');
        } catch (error) {
            console.error('API key update error', error);
        }
    };

    const refreshAvatarOptions = () => {
        const categories = ['bottts', 'avataaars', 'micah', 'pixel-art', 'adventurer', 'open-peeps', 'lorelei', 'fun-emoji', 'notionists'];
        const newAvatars = [];
        for (let i = 0; i < 9; i++) {
            const category = categories[i % categories.length];
            const seed = Math.random().toString(36).substring(7);
            newAvatars.push({
                url: `https://api.dicebear.com/9.x/${category}/png?seed=${seed}&backgroundColor=c7ecee&radius=50`,
                seed,
                category,
            });
        }
        setGalleryAvatars(newAvatars);
    };

    const selectAvatar = (avatar) => {
        handleUpdateAvatar(avatar.url, avatar.seed);
    };

    const bannerAssets = {
        'local-banner-1': require('../../assets/banners/blue_geometric.png'),
        'local-banner-2': require('../../assets/banners/blue_abstract.png'),
        'local-banner-3': require('../../assets/banners/blue_shapes.png'),
        'local-banner-4': require('../../assets/banners/blue_cloud.png'),
    };

    const avatarSourceUri = profilePreview || user?.preferences?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || 'User')}&background=0A66C2&color=fff&size=200`;

    const renderAvatar = (size = 118) => {
        let borderColors = ['#0A66C2', '#3B82F6', '#60A5FA'];
        let borderWidth = 3;

        if (user?.subscription?.type === 'advance') {
            borderColors = ['#FFDF00', '#FFF8DC', '#FFDF00', '#F59E0B', '#FFDF00'];
            borderWidth = 4;
        } else if (user?.subscription?.type === 'standard') {
            borderColors = ['#F59E0B', '#D97706'];
            borderWidth = 3;
        }

        return (
            <GradientBorder size={size} borderWidth={borderWidth} colors={borderColors}>
                <View style={styles.avatarWrapper}>
                    <Image
                        key={user?.preferences?.avatarUrl || profilePreview}
                        source={{ uri: avatarSourceUri }}
                        style={styles.avatarImg}
                    />
                    {uploading === 'profile' && (
                        <View style={styles.uploadOverlay}>
                            <ActivityIndicator size="small" color="#FFF" />
                        </View>
                    )}
                </View>
            </GradientBorder>
        );
    };

    const AcademicTile = ({ icon: Icon, iconColor = Colors.primary, iconBg = '#EFF6FF', label, value, fullWidth = false }) => (
        <View style={[styles.academicTile, fullWidth && styles.academicTileFull, isDesktop && !fullWidth && styles.academicTileHalf]}>
            <View style={[styles.academicIconBox, { backgroundColor: iconBg }]}>
                <Icon size={18} color={iconColor} />
            </View>
            <View style={styles.academicTextCol}>
                <Text style={styles.academicLabel}>{label}</Text>
                <Text style={styles.academicValue} numberOfLines={1}>{value || 'Not set'}</Text>
            </View>
        </View>
    );

    const backButtonTop = Platform.OS === 'web' ? 16 : Math.max(insets.top + 8, 16);

    return (
        <MainLayout showHeader={false} noPadding>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={Platform.OS === 'web'}
            >
                <View style={[styles.shell, isDesktop && styles.desktopShell]}>
                    {/* Hero Header Card */}
                    <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
                        {/* Banner Section */}
                        <View style={[styles.bannerContainer, isDesktop && styles.bannerContainerDesktop]}>
                            <Image
                                key={user?.bannerUrl || bannerPreview}
                                source={
                                    bannerPreview
                                        ? { uri: bannerPreview }
                                        : (user?.bannerUrl && bannerAssets[user.bannerUrl]
                                            ? bannerAssets[user.bannerUrl]
                                            : { uri: user?.bannerUrl || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=1000' })
                                }
                                style={styles.bannerImg}
                                resizeMode="cover"
                            />

                            {/* Banner Scrim for contrast */}
                            <View style={styles.bannerScrim} />

                            {/* Top-Left Back Button */}
                            <TouchableOpacity
                                style={[styles.backBtn, { top: backButtonTop }]}
                                onPress={() => {
                                    if (navigation.canGoBack()) {
                                        navigation.goBack();
                                    } else {
                                        navigation.navigate('Dashboard');
                                    }
                                }}
                                activeOpacity={0.8}
                                accessibilityLabel="Back"
                                accessibilityRole="button"
                            >
                                <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2.5} />
                            </TouchableOpacity>

                            {/* Banner Edit Button */}
                            <TouchableOpacity
                                style={styles.bannerEditBtn}
                                onPress={() => pickImage('banner')}
                                disabled={uploading !== null}
                                activeOpacity={0.8}
                                accessibilityLabel="Edit banner image"
                            >
                                {uploading === 'banner' ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Camera size={15} color="#FFFFFF" />
                                        <Text style={styles.bannerEditText}>{isDesktop ? 'Edit Cover' : 'Edit'}</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Profile Info Header */}
                        <View style={[styles.profileHeaderContent, isDesktop && styles.profileHeaderContentDesktop]}>
                            <View style={styles.avatarOuterContainer}>
                                {renderAvatar(isDesktop ? 128 : 116)}
                                <TouchableOpacity
                                    style={styles.cameraBtn}
                                    onPress={() => pickImage('profile')}
                                    disabled={uploading !== null}
                                    activeOpacity={0.8}
                                    accessibilityLabel="Change profile photo"
                                >
                                    <Camera size={15} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>

                            <View style={[styles.profileMetaBox, isDesktop && styles.profileMetaBoxDesktop]}>
                                <View style={[styles.nameRow, isDesktop && styles.nameRowDesktop]}>
                                    <Text style={styles.name}>{user?.displayName || 'Student User'}</Text>
                                    <View style={styles.badgeRow}>
                                        <View style={styles.roleBadge}>
                                            <Shield size={12} color={Colors.primary} />
                                            <Text style={styles.roleBadgeText}>
                                                {(user?.role || 'STUDENT').toUpperCase()} • ALLOTEME
                                            </Text>
                                        </View>
                                        {user?.subscription?.type && (
                                            <View style={[
                                                styles.subBadge,
                                                user.subscription.type === 'advance' ? styles.subAdvanceBadge : styles.subStandardBadge
                                            ]}>
                                                <Sparkles size={11} color={user.subscription.type === 'advance' ? '#B45309' : '#047857'} />
                                                <Text style={[
                                                    styles.subBadgeText,
                                                    user.subscription.type === 'advance' ? styles.subAdvanceText : styles.subStandardText
                                                ]}>
                                                    {user.subscription.type.toUpperCase()}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {user?.email ? (
                                    <View style={styles.emailRow}>
                                        <Mail size={14} color="#64748B" />
                                        <Text style={styles.emailText}>{user.email}</Text>
                                    </View>
                                ) : null}
                            </View>

                            {/* Desktop Quick Header Actions */}
                            {isDesktop && (
                                <View style={styles.desktopHeaderActions}>
                                    <TouchableOpacity
                                        style={styles.desktopActionBtnPrimary}
                                        onPress={() => navigation.navigate('CompleteProfile')}
                                        activeOpacity={0.8}
                                    >
                                        <Edit2 size={16} color="#FFFFFF" />
                                        <Text style={styles.desktopActionBtnPrimaryText}>Edit Profile</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.desktopActionBtnSecondary}
                                        onPress={() => navigation.navigate('Settings')}
                                        activeOpacity={0.8}
                                    >
                                        <Settings size={16} color={Colors.text.primary} />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Stats Highlights Row */}
                    <View style={styles.statsContainer}>
                        <View style={styles.statCard}>
                            <View style={[styles.statIconBox, { backgroundColor: '#EFF6FF' }]}>
                                <Award size={18} color={Colors.primary} />
                            </View>
                            <Text style={styles.statVal}>{user?.percentile ? `${user.percentile}%` : '0.0%'}</Text>
                            <Text style={styles.statLab}>Percentile</Text>
                        </View>

                        <View style={styles.statCard}>
                            <View style={[styles.statIconBox, { backgroundColor: '#ECFDF5' }]}>
                                <Bookmark size={18} color="#059669" />
                            </View>
                            <Text style={styles.statVal}>{user?.savedColleges?.length || 0}</Text>
                            <Text style={styles.statLab}>Saved Colleges</Text>
                        </View>

                        <View style={styles.statCard}>
                            <View style={[styles.statIconBox, { backgroundColor: '#FEF3C7' }]}>
                                <Target size={18} color="#D97706" />
                            </View>
                            <Text style={styles.statVal}>{user?.rank || 'N/A'}</Text>
                            <Text style={styles.statLab}>Merit Rank</Text>
                        </View>
                    </View>

                    {/* Main Content Layout (2 Columns on Web/Desktop, 1 Column on Mobile) */}
                    <View style={[styles.contentGrid, isDesktop && styles.contentGridDesktop]}>
                        {/* Column 1: Academic Profile & Actions */}
                        <View style={[styles.column, isDesktop && styles.columnMain]}>
                            {/* Academic Details Card */}
                            <Card style={styles.sectionCard}>
                                <View style={styles.cardHeader}>
                                    <View style={styles.cardHeaderLeft}>
                                        <View style={[styles.headerIconCircle, { backgroundColor: '#EFF6FF' }]}>
                                            <BookOpen size={18} color={Colors.primary} />
                                        </View>
                                        <View>
                                            <Text style={styles.cardTitle}>Academic Details</Text>
                                            <Text style={styles.cardSub}>Verified admission criteria & scores</Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.academicTilesContainer}>
                                    <AcademicTile
                                        icon={Award}
                                        label="Primary Exam"
                                        value={user?.examType || 'MHTCET'}
                                        iconColor="#0A66C2"
                                        iconBg="#EFF6FF"
                                    />
                                    <AcademicTile
                                        icon={Hash}
                                        label="Percentile"
                                        value={user?.percentile ? `${user.percentile}%` : null}
                                        iconColor="#059669"
                                        iconBg="#ECFDF5"
                                    />
                                    <AcademicTile
                                        icon={Target}
                                        label="General Merit Rank"
                                        value={user?.rank}
                                        iconColor="#D97706"
                                        iconBg="#FEF3C7"
                                    />
                                    <AcademicTile
                                        icon={MapPin}
                                        label="Location / Domicile"
                                        value={user?.location}
                                        iconColor="#7C3AED"
                                        iconBg="#F5F3FF"
                                    />
                                    <AcademicTile
                                        icon={Phone}
                                        label="Contact Number"
                                        value={user?.phoneNumber}
                                        iconColor="#2563EB"
                                        iconBg="#EFF6FF"
                                    />
                                    <AcademicTile
                                        icon={BookOpen}
                                        label="Expected Region"
                                        value={user?.expectedRegion}
                                        iconColor="#DB2777"
                                        iconBg="#FDF2F8"
                                    />
                                    {user?.email && (
                                        <AcademicTile
                                            icon={Mail}
                                            label="Registered Email"
                                            value={user.email}
                                            iconColor="#0A66C2"
                                            iconBg="#EFF6FF"
                                            fullWidth={true}
                                        />
                                    )}
                                </View>
                            </Card>

                            {/* Mobile Actions Card */}
                            {!isDesktop && (
                                <Card style={styles.actionsCard}>
                                    <Button
                                        title="Edit Profile"
                                        variant="outline"
                                        icon={Edit2}
                                        onPress={() => navigation.navigate('CompleteProfile')}
                                        style={styles.mobileEditBtn}
                                    />

                                    <TouchableOpacity
                                        style={styles.settingsRowBtn}
                                        onPress={() => navigation.navigate('Settings')}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.settingsRowLeft}>
                                            <View style={styles.settingsIconCircle}>
                                                <Settings size={18} color={Colors.primary} />
                                            </View>
                                            <Text style={styles.settingsRowText}>App Settings & Preferences</Text>
                                        </View>
                                        <ChevronRight size={18} color="#94A3B8" />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.logoutBtn}
                                        onPress={handleLogout}
                                        disabled={isLoggingOut}
                                        activeOpacity={0.7}
                                    >
                                        {isLoggingOut ? (
                                            <>
                                                <ActivityIndicator size="small" color={Colors.error} />
                                                <Text style={styles.logoutText}>Signing out...</Text>
                                            </>
                                        ) : (
                                            <>
                                                <LogOut size={18} color={Colors.error} />
                                                <Text style={styles.logoutText}>Log Out</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </Card>
                            )}
                        </View>

                        {/* Column 2: AI Avatar Assistant & Desktop Actions */}
                        <View style={[styles.column, isDesktop && styles.columnSide]}>
                            {/* AI Avatar Assistant Card */}
                            <Card style={styles.sectionCard}>
                                <View style={styles.cardHeader}>
                                    <View style={styles.cardHeaderLeft}>
                                        <View style={[styles.headerIconCircle, { backgroundColor: '#FDF2F8' }]}>
                                            <Sparkles size={18} color="#DB2777" />
                                        </View>
                                        <View>
                                            <Text style={styles.cardTitle}>AI Avatar Assistant</Text>
                                            <Text style={styles.cardSub}>Personalize your ETA AI persona</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.refreshBtn}
                                        onPress={refreshAvatarOptions}
                                        activeOpacity={0.7}
                                    >
                                        <RefreshCw size={13} color={Colors.primary} />
                                        <Text style={styles.refreshBtnText}>Generate</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.avatarGrid}>
                                    {galleryAvatars.map((item, index) => {
                                        const isCurrent = user?.preferences?.avatarSeed === item.seed;
                                        return (
                                            <TouchableOpacity
                                                key={index}
                                                style={styles.galleryItem}
                                                onPress={() => selectAvatar(item)}
                                                disabled={avatarLoading}
                                                activeOpacity={0.75}
                                            >
                                                <View style={[styles.avatarCircle, isCurrent && styles.avatarCircleActive]}>
                                                    <Image source={{ uri: item.url }} style={styles.galleryImg} />
                                                    {isCurrent && (
                                                        <View style={styles.checkBadge}>
                                                            <Check size={11} color="white" strokeWidth={3} />
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[styles.categoryLabel, isCurrent && styles.categoryLabelActive]} numberOfLines={1}>
                                                    {item.category}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {avatarLoading && (
                                    <View style={styles.inlineLoader}>
                                        <ActivityIndicator size="small" color={Colors.primary} />
                                        <Text style={styles.inlineLoaderText}>Updating persona avatar...</Text>
                                    </View>
                                )}
                            </Card>

                            {/* Desktop Actions Card */}
                            {isDesktop && (
                                <Card style={styles.actionsCard}>
                                    <TouchableOpacity
                                        style={styles.settingsRowBtn}
                                        onPress={() => navigation.navigate('Settings')}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.settingsRowLeft}>
                                            <View style={styles.settingsIconCircle}>
                                                <Settings size={18} color={Colors.primary} />
                                            </View>
                                            <Text style={styles.settingsRowText}>App Settings & Preferences</Text>
                                        </View>
                                        <ChevronRight size={18} color="#94A3B8" />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.logoutBtn}
                                        onPress={handleLogout}
                                        disabled={isLoggingOut}
                                        activeOpacity={0.7}
                                    >
                                        {isLoggingOut ? (
                                            <>
                                                <ActivityIndicator size="small" color={Colors.error} />
                                                <Text style={styles.logoutText}>Signing out...</Text>
                                            </>
                                        ) : (
                                            <>
                                                <LogOut size={18} color={Colors.error} />
                                                <Text style={styles.logoutText}>Log Out</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </Card>
                            )}
                        </View>
                    </View>

                    {/* Bottom Spacing */}
                    <View style={{ height: 60 }} />
                </View>
            </ScrollView>
        </MainLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    scrollContent: {
        flexGrow: 1,
    },
    shell: {
        width: '100%',
    },
    desktopShell: {
        maxWidth: 1040,
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: 16,
    },

    /* Hero Section Card */
    heroCard: {
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
    },
    heroCardDesktop: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        ...Shadows.sm,
        marginTop: 4,
    },

    /* Banner Container */
    bannerContainer: {
        height: 180,
        width: '100%',
        position: 'relative',
        backgroundColor: '#0F172A',
    },
    bannerContainerDesktop: {
        height: 220,
    },
    bannerImg: {
        width: '100%',
        height: '100%',
    },
    bannerScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.25)',
    },

    /* Top Left Back Button */
    backBtn: {
        position: 'absolute',
        left: 16,
        zIndex: 30,
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        ...Shadows.md,
    },

    /* Banner Edit Button */
    bannerEditBtn: {
        position: 'absolute',
        bottom: 14,
        right: 16,
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        ...Shadows.sm,
    },
    bannerEditText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },

    /* Profile Header Info */
    profileHeaderContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
        alignItems: 'center',
    },
    profileHeaderContentDesktop: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 28,
        paddingBottom: 24,
    },
    avatarOuterContainer: {
        marginTop: -58,
        position: 'relative',
        alignSelf: 'center',
    },
    avatarWrapper: {
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 999,
        overflow: 'hidden',
    },
    avatarImg: {
        width: '100%',
        height: '100%',
    },
    uploadOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 999,
    },
    cameraBtn: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        backgroundColor: Colors.primary,
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2.5,
        borderColor: Colors.white,
        zIndex: 10,
        ...Shadows.sm,
    },
    profileMetaBox: {
        alignItems: 'center',
        marginTop: 12,
    },
    profileMetaBoxDesktop: {
        alignItems: 'flex-start',
        marginLeft: 20,
        flex: 1,
        marginTop: 10,
    },
    nameRow: {
        alignItems: 'center',
    },
    nameRowDesktop: {
        alignItems: 'flex-start',
    },
    name: {
        fontSize: 22,
        fontWeight: '700',
        color: Colors.text.primary,
        letterSpacing: -0.3,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    roleBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
        letterSpacing: 0.4,
    },
    subBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
    },
    subAdvanceBadge: {
        backgroundColor: '#FEF3C7',
        borderColor: '#FDE68A',
    },
    subAdvanceText: {
        color: '#B45309',
        fontSize: 11,
        fontWeight: '700',
    },
    subStandardBadge: {
        backgroundColor: '#ECFDF5',
        borderColor: '#A7F3D0',
    },
    subStandardText: {
        color: '#047857',
        fontSize: 11,
        fontWeight: '700',
    },
    emailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    emailText: {
        fontSize: 13,
        color: '#64748B',
    },
    desktopHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
    },
    desktopActionBtnPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        ...Shadows.sm,
    },
    desktopActionBtnPrimaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    desktopActionBtnSecondary: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center',
    },

    /* Stats Highlighting Row */
    statsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginTop: 16,
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: Colors.white,
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        ...Shadows.sm,
    },
    statIconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statVal: {
        fontSize: 17,
        fontWeight: '700',
        color: Colors.text.primary,
    },
    statLab: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '500',
        marginTop: 2,
        textAlign: 'center',
    },

    /* Content Layout */
    contentGrid: {
        paddingHorizontal: 16,
        marginTop: 16,
        gap: 16,
    },
    contentGridDesktop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 0,
        gap: 20,
    },
    column: {
        gap: 16,
    },
    columnMain: {
        flex: 1.15,
    },
    columnSide: {
        flex: 0.85,
    },

    /* Section Cards */
    sectionCard: {
        padding: 18,
        borderRadius: 18,
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        ...Shadows.sm,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text.primary,
    },
    cardSub: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 1,
    },

    /* Academic Details Tiles */
    academicTilesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    academicTile: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 12,
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    academicTileHalf: {
        width: '48.5%',
    },
    academicTileFull: {
        width: '100%',
    },
    academicIconBox: {
        width: 38,
        height: 38,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    academicTextCol: {
        flex: 1,
    },
    academicLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    academicValue: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text.primary,
        marginTop: 2,
    },

    /* AI Avatar Section */
    refreshBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    refreshBtnText: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600',
    },
    avatarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    galleryItem: {
        width: '31%',
        alignItems: 'center',
        marginBottom: 14,
    },
    avatarCircle: {
        width: 66,
        height: 66,
        borderRadius: 33,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        position: 'relative',
    },
    avatarCircleActive: {
        borderColor: Colors.primary,
        backgroundColor: '#EFF6FF',
        borderWidth: 2.5,
    },
    galleryImg: {
        width: '90%',
        height: '90%',
    },
    checkBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: Colors.primary,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: Colors.white,
    },
    categoryLabel: {
        fontSize: 11,
        color: '#64748B',
        marginTop: 4,
        textTransform: 'capitalize',
        fontWeight: '500',
    },
    categoryLabelActive: {
        color: Colors.primary,
        fontWeight: '600',
    },
    inlineLoader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
        marginTop: 8,
        paddingVertical: 4,
    },
    inlineLoaderText: {
        fontSize: 12,
        color: '#64748B',
    },

    /* Action Buttons */
    actionsCard: {
        padding: 16,
        borderRadius: 18,
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        gap: 12,
        ...Shadows.sm,
    },
    mobileEditBtn: {
        width: '100%',
    },
    settingsRowBtn: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    settingsRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    settingsIconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    settingsRowText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text.primary,
    },
    logoutBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    logoutText: {
        color: Colors.error,
        fontWeight: '600',
        fontSize: 14,
    },
});

export default ProfileScreen;
