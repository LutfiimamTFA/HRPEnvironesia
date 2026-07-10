"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { User as FirebaseAuthUser } from "firebase/auth";
import { doc } from "firebase/firestore";
import { useUser, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { type UserProfile, ROLES_INTERNAL } from "@/lib/types";

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
    return doc(firestore, "users", firebaseUser.uid);
  }, [firestore, firebaseUser?.uid]);

  const {
    data: userProfileData,
    isLoading: isProfileLoading,
    error: profileError,
    mutate,
  } = useDoc<UserProfile>(userDocRef);

  // Item 8: a transient Firestore read error (network blip, brief permission
  // propagation delay, resource-exhausted cooldown, ...) must NOT be treated
  // as "user has no profile" — useDoc() nulls its `data` on any onSnapshot
  // error, and AdminGuard redirects to /admin/login whenever userProfile is
  // null. Without this, a one-off Firestore hiccup silently logs an actively
  // present user out. Keep the last successfully-loaded profile around and
  // only actually drop it once Firebase Auth itself says the user is gone.
  const lastGoodProfileRef = useRef<UserProfile | null>(null);
  if (userProfileData) {
    lastGoodProfileRef.current = userProfileData;
  }
  if (!firebaseUser) {
    lastGoodProfileRef.current = null;
  }
  if (profileError) {
    // eslint-disable-next-line no-console
    console.warn('[auth-provider] users/{uid} read error — keeping last known profile, not forcing logout:', profileError);
  }

  // Auto-sync role documents for data consistency — at most ONCE per uid per
  // browser session. This used to depend on `userProfileData` (a new object
  // on every users/{uid} snapshot), and the sync itself writes to
  // users/{uid}.hrdScope — which re-fires that very snapshot, re-running this
  // effect, re-syncing, forever. That infinite feedback loop is what caused
  // the repeated "POST /api/admin/sync-my-role" spam and the HRD dashboard
  // flicker. Depending only on the uid (a stable primitive) plus a
  // ref+sessionStorage guard breaks the loop.
  const syncRoleOnceRef = useRef<string | null>(null);
  useEffect(() => {
    const role = userProfileData?.role;
    if (!firebaseUser || !role || !ROLES_INTERNAL.includes(role)) return;

    const uid = firebaseUser.uid;
    const sessionKey = `sync-role:${uid}`;

    if (syncRoleOnceRef.current === uid) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(sessionKey) === "done") {
      syncRoleOnceRef.current = uid;
      return;
    }

    syncRoleOnceRef.current = uid;
    // eslint-disable-next-line no-console
    console.log("[SYNC_MY_ROLE_CALL]", uid);

    (async () => {
      try {
        const idToken = await firebaseUser.getIdToken();
        await fetch("/api/admin/sync-my-role", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (typeof window !== "undefined") sessionStorage.setItem(sessionKey, "done");
      } catch (error) {
        console.warn("Failed to sync role documents on client side:", error);
        // Allow a retry later this session if it genuinely failed.
        syncRoleOnceRef.current = null;
      }
    })();
  }, [firebaseUser, userProfileData?.role]);

  const refreshUserProfile = useCallback(() => {
    mutate();
  }, [mutate]);

  const userProfile = userProfileData ?? (firebaseUser ? lastGoodProfileRef.current : null);

  const loading = isAuthLoading || (!!firebaseUser && isProfileLoading && !lastGoodProfileRef.current);

  const value = { firebaseUser, userProfile, loading, refreshUserProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // FirebaseClientProvider is now in the root layout's providers,
  // so we don't need to wrap it here.
  return <AuthContent>{children}</AuthContent>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
