// US-04: the login token is kept in the device keychain / keystore (expo-secure-store), never in AsyncStorage.
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'nowaste.token';

export async function loadToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function deleteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing saved.
  }
}
