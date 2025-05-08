// src/contexts/AuthContext.tsx
import React from 'react';

export interface AuthContextType {
  signIn: (token: string) => void;
  signOut: () => void;
  isLoggedIn: boolean;
}

export const AuthContext = React.createContext<AuthContextType>({
  signIn: () => {},
  signOut: () => {},
  isLoggedIn: false,
});
