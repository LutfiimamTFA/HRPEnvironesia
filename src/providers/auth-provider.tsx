'use client';

import { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';
import { User as FirebaseAuthUser } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { 
  useUser, 
  useDoc, 
  useFirestore, 
  useMemoFirebase, 
  FirebaseClientProvider,
  setDocumentNonBlocking,
  deleteDocumentNonBlocking
} from '@/firebase';
import type { UserProfile } from '@/lib/types';

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

  const refreshUserProfile = useCallback(() => {
    mutate();
  }, [mutate]);

  const userProfile = userProfileData ?? null;

  useEffect(() => {
    // This effect acts as a self-healing mechanism for role consistency.
    if (!userProfile || !firestore) return;

    const syncRoleDocument = async () => {
      const { uid, role } = userProfile;
      const hrdRoleDocRef = doc(firestore, 'roles_hrd', uid);
      const adminRoleDocRef = doc(firestore, 'roles_admin', uid);

      if (role === 'hrd') {
        // Ensure the hrd role doc exists
        await setDocumentNonBlocking(hrdRoleDocRef, { role: 'hrd' }, {});
      } else {
        // Ensure the hrd role doc does not exist
        await deleteDocumentNonBlocking(hrdRoleDocRef).catch(() => {});
      }
      
      if (role === 'super-admin') {
        // Ensure the admin role doc exists
        await setDocumentNonBlocking(adminRoleDocRef, { role: 'super-admin' }, {});
      } else {
        // Ensure the admin role doc does not exist
        await deleteDocumentNonBlocking(adminRoleDocRef).catch(() => {});
      }
    };

    syncRoleDocument();
  }, [userProfile, firestore]);

  // The overall loading state is true if either the auth state or the profile data is still loading.
  // This prevents an infinite loading state if a user is authenticated but has no profile document.
  const loading = isAuthLoading || (!!firebaseUser && isProfileLoading);
  
  const value = { firebaseUser, userProfile, loading, refreshUserProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  return (
    <FirebaseClientProvider>
      <AuthContent>
        {children}
      </AuthContent>
    </FirebaseClientProvider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
