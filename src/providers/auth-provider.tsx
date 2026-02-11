'use client';

import { createContext, useContext, ReactNode, useEffect } from 'react';
import { User as FirebaseAuthUser } from 'firebase/auth';
import { doc, serverTimestamp } from 'firebase/firestore';
import { 
  useUser, 
  useDoc, 
  useFirestore, 
  useMemoFirebase, 
  FirebaseClientProvider,
  setDocumentNonBlocking
} from '@/firebase';
import type { UserProfile, UserRole } from '@/lib/types';

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

const getRoleFromEmail = (email: string | null): UserRole => {
  switch (email) {
    case 'super_admin@gmail.com':
      return 'super-admin';
    case 'manager@gmail.com':
      return 'manager';
    case 'hrd@gmail.com':
      return 'hrd';
    case 'karyawan@gmail.com':
      return 'karyawan';
    case 'kandidat@gmail.com':
      return 'kandidat';
    default:
      return 'kandidat'; // Default for any other email
  }
};


function AuthContent({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !firebaseUser) return null;
    return doc(firestore, 'users', firebaseUser.uid);
  }, [firestore, firebaseUser]);
  
  const { data: userProfileData, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  useEffect(() => {
    if (firebaseUser && !userProfileData && !isAuthLoading && !isProfileLoading && userDocRef) {
        const role = getRoleFromEmail(firebaseUser.email);
        const newProfileData: Omit<UserProfile, 'createdAt'> & { createdAt: any } = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || 'unknown@example.com',
            fullName: firebaseUser.displayName || 'New User',
            role: role,
            isActive: true,
            createdAt: serverTimestamp(),
        };
        setDocumentNonBlocking(userDocRef, newProfileData, { merge: false });
    }
  }, [firebaseUser, userProfileData, isAuthLoading, isProfileLoading, userDocRef, firestore]);

  const userProfile = userProfileData ?? null;
  const loading = isAuthLoading || (!!firebaseUser && !userProfile);
  
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
