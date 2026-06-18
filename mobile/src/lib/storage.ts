// Stocare persistentă (token + preferințe). @capacitor/preferences are implementare web (browser)
// și nativă (Android Keystore-backed SharedPreferences) → funcționează la fel în dev și pe device.
// Faza 2: mută tokenul în SecureStorage (community plugin) pentru hardening.
import { Preferences } from '@capacitor/preferences';

const TOKEN = 'auth_token';
const USER = 'auth_user';
const THEME = 'pref_theme';

export async function saveToken(t: string) { await Preferences.set({ key: TOKEN, value: t }); }
export async function loadToken(): Promise<string | null> { return (await Preferences.get({ key: TOKEN })).value; }
export async function clearToken() { await Preferences.remove({ key: TOKEN }); await Preferences.remove({ key: USER }); }

export async function saveUser(u: unknown) { await Preferences.set({ key: USER, value: JSON.stringify(u) }); }
export async function loadUser<T = any>(): Promise<T | null> {
  const v = (await Preferences.get({ key: USER })).value;
  try { return v ? JSON.parse(v) as T : null; } catch { return null; }
}

export async function getTheme(): Promise<string | null> { return (await Preferences.get({ key: THEME })).value; }
export async function setTheme(t: string) { await Preferences.set({ key: THEME, value: t }); }
