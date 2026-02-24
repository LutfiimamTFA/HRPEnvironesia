'use client';

import { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';
import { User as FirebaseAuthUser } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { 
  useUser, 
  useDoc, 
  useFirestore, 
  useMemoFirebase,
} from '@/firebase';
import type { UserProfile, ROLES_INTERNAL } from '@/lib/types';

type AuthContextType = {
  firebaseUser: FirebaseAuthUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  refreshUserProfile: () => void;
};

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userProfile: null,
  loading: true,
  refreshUserProfile: () => {},
});

function AuthContent({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !firebaseUser) return null;
    return doc(firestore, 'users', firebaseUser.uid);
  }, [firestore, firebaseUser]);
  
  const { data: userProfileData, isLoading: isProfileLoading, mutate } = useDoc<UserProfile>(userDocRef);

  // Auto-sync role documents for data consistency
  useEffect(() => {
    // Only run for authenticated internal users whose profiles have loaded
    if (firebaseUser && userProfileData && ROLES_INTERNAL.includes(userProfileData.role)) {
      const syncRoleDocuments = async () => {
        try {
          const idToken = await firebaseUser.getIdToken();
          await fetch('/api/admin/sync-my-role', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
          });
          // We don't need to do anything with the response, this is a background sync
        } catch (error) {
          console.warn('Failed to sync role documents on client side:', error);
        }
      };
      syncRoleDocuments();
    }
  }, [firebaseUser, userProfileData]);


  const refreshUserProfile = useCallback(() => {
    mutate();
  }, [mutate]);

  const userProfile = userProfileData ?? null;

  const loading = isAuthLoading || (!!firebaseUser && isProfileLoading);
  
  const value = { firebaseUser, userProfile, loading, refreshUserProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // FirebaseClientProvider is now in the root layout's providers,
  // so we don't need to wrap it here.
  return (
      <AuthContent>
        {children}
      </AuthContent>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
