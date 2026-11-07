import { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [userToken, setUserToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for token on app load
    const bootstrapAsync = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        setUserToken(token);
      } catch (e) {
        console.error('Failed to restore token', e);
      } finally {
        setIsLoading(false);
      }
    };
    bootstrapAsync();
  }, []);

  const authContext = {
    signIn: async (token, user) => {
      setUserToken(token);
      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
    },
    signOut: async () => {
      setUserToken(null);
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
    },
    userToken,
    isLoading,
  };

  return (
    <AuthContext.Provider value={authContext}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}