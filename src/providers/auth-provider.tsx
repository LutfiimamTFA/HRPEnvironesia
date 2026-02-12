'use client';

import { createContext, useContext, ReactNode } from 'react';
import { User as FirebaseAuthUser } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { 
  useUser, 
  useDoc, 
  useFirestore, 
  useMemoFirebase, 
  FirebaseClientProvider,
} from '@/firebase';
import type { UserProfile } from '@/lib/types';

type AuthContextType = {
  firebaseUser: FirebaseAuthUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userProfile: null,
  loading: true,
});

function AuthContent({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !firebaseUser) return null;
    return doc(firestore, 'users', firebaseUser.uid);
  }, [firestore, firebaseUser]);
  
  const { data: userProfileData, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const userProfile = userProfileData ?? null;

  // The overall loading state is true if either the auth state or the profile data is still loading.
  // This prevents an infinite loading state if a user is authenticated but has no profile document.
  const loading = isAuthLoading || (!!firebaseUser && isProfileLoading);
  
  const value = { firebaseUser, userProfile, loading };

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
