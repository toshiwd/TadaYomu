import type { ReadingProgress, SiteType, Novel } from '../types/novel';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export interface SyncService {
    /** Whether the user is signed in */
    isSignedIn(): boolean;
    /** Sign in with Google */
    signIn(): Promise<void>;
    /** Sign out */
    signOut(): Promise<void>;
    /** Upload reading progress */
    uploadProgress(progress: ReadingProgress): Promise<void>;
    /** Download latest progress for a novel */
    downloadProgress(siteNovelId: string, siteType: string): Promise<ReadingProgress | null>;
    /** Upload the entire library list */
    uploadLibrary(novels: Novel[]): Promise<void>;
    /** Download the library list and deleted tombstones */
    downloadLibrary(): Promise<{ novels: Partial<Novel>[], deletedAt: Record<string, number> } | null>;
    /** Mark a novel as deleted in the synced library to prevent re-downloading */
    deleteNovelFromLibrary(siteType: string, siteNovelId: string): Promise<void>;
    /** Get display name or email */
    getUserDisplayName(): string | null;
}

// Configure Google Sign-In
GoogleSignin.configure({
    webClientId: '502448656804-oco6tq3au1crttoandmi94akqbqfa600.apps.googleusercontent.com', // Replace with value from Firebase Console
});

export const syncService: SyncService = {
    isSignedIn() {
        return !!auth().currentUser;
    },

    async signIn() {
        try {
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
            const { data } = await GoogleSignin.signIn();
            const idToken = data?.idToken;
            if (!idToken) throw new Error('No ID token found');

            const googleCredential = auth.GoogleAuthProvider.credential(idToken);
            await auth().signInWithCredential(googleCredential);
        } catch (error) {
            console.error('Google Sign-In failed', error);
            throw error;
        }
    },

    async signOut() {
        try {
            await GoogleSignin.signOut();
            await auth().signOut();
        } catch (error) {
            console.error('Sign-Out failed', error);
        }
    },

    async uploadProgress(progress: ReadingProgress) {
        const user = auth().currentUser;
        if (!user) return;

        const docId = `${progress.siteType}_${progress.siteNovelId}`;
        try {
            await firestore()
                .collection('users')
                .doc(user.uid)
                .collection('reading_progress')
                .doc(docId)
                .set({
                    ...progress,
                    updatedAt: firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
        } catch (error) {
            console.error('Upload progress failed', error);
        }
    },

    async downloadProgress(siteNovelId: string, siteType: string) {
        const user = auth().currentUser;
        if (!user) return null;

        const docId = `${siteType}_${siteNovelId}`;
        try {
            const doc = await firestore()
                .collection('users')
                .doc(user.uid)
                .collection('reading_progress')
                .doc(docId)
                .get();

            const data = doc.data();
            if (data) {
                // Convert back specific fields if needed
                return data as ReadingProgress;
            }
        } catch (error) {
            console.error('Download progress failed', error);
        }
        return null;
    },

    async uploadLibrary(novels: Novel[]) {
        const user = auth().currentUser;
        if (!user) return;

        // Extract essential properties to save space
        const libraryData = novels.map(n => ({
            siteNovelId: n.siteNovelId,
            siteType: n.siteType,
            title: n.title,
            author: n.author,
            synopsis: n.synopsis,
            totalEpisodes: n.totalEpisodes,
            url: n.url,
            coverPath: n.coverPath,
            isComplete: n.isComplete,
            siteUpdatedAt: n.siteUpdatedAt,
            addedAt: n.addedAt,
        }));

        try {
            await firestore()
                .collection('users')
                .doc(user.uid)
                .collection('library')
                .doc('index')
                .set({
                    novels: libraryData,
                    updatedAt: firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
        } catch (error) {
            console.error('Upload library failed', error);
        }
    },

    async downloadLibrary() {
        const user = auth().currentUser;
        if (!user) return null;

        try {
            const doc = await firestore()
                .collection('users')
                .doc(user.uid)
                .collection('library')
                .doc('index')
                .get();

            const data = doc.data();
            if (data && data.novels && Array.isArray(data.novels)) {
                return {
                    novels: data.novels as Partial<Novel>[],
                    deletedAt: data.deletedAt || {}
                };
            }
        } catch (error) {
            console.error('Download library failed', error);
        }
        return null;
    },

    async deleteNovelFromLibrary(siteType: string, siteNovelId: string) {
        const user = auth().currentUser;
        if (!user) return;

        const docKey = `${siteType}_${siteNovelId}`;
        try {
            await firestore()
                .collection('users')
                .doc(user.uid)
                .collection('library')
                .doc('index')
                .set({
                    deletedAt: {
                        [docKey]: Date.now()
                    },
                    updatedAt: firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
        } catch (error) {
            console.error('Delete novel from library sync failed', error);
        }
    },

    getUserDisplayName() {
        const user = auth().currentUser;
        return user?.displayName || user?.email || null;
    },
};
