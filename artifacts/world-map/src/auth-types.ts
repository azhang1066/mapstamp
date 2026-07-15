export interface AuthUser {
  id: string;
  firstName: string | null;
  profileImageUrl: string | null;
}

export interface AuthProps {
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
}
