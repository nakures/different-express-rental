import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://differentexpress.com/chigau/api';

export async function authFetch(endpoint, options = {}) {
  const token = await AsyncStorage.getItem('token');
  if (!token) throw new Error('No token found. Please login.');

  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${API_BASE_URL}/${endpoint}${sep}token=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Auth-Token': token,
      ...(options.headers || {}),
    },
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

export async function publicFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return response.json();
}

export async function saveAuth(token, user) {
  await AsyncStorage.setItem('token', token);
  await AsyncStorage.setItem('user', JSON.stringify(user));
}

export async function clearAuth() {
  await AsyncStorage.removeItem('token');
  await AsyncStorage.removeItem('user');
}

export async function getStoredUser() {
  const user = await AsyncStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export const API_BASE = API_BASE_URL;

export async function getAuthToken() {
  return await AsyncStorage.getItem('token');
}