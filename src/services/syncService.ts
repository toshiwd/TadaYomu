import type { ReadingProgress, SiteType } from '../types/novel';
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

    getUserDisplayName() {
        const user = auth().currentUser;
        return user?.displayName || user?.email || null;
    },
};
