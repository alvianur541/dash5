import { supabase } from './supabase';

const RP_ID = (import.meta.env.VITE_PASSKEY_RP_ID as string | undefined) || 'dash5.my.id';
const OFFER_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const offerKey = (uid: string) => `dash-passkey-offer-${uid}`;

// Passkeys are bound to the RP ID configured in Supabase Auth; any other host would fail the ceremony.
export function passkeyDomainOk(): boolean {
  const host = window.location.hostname;
  return host === RP_ID || host.endsWith(`.${RP_ID}`);
}

export async function passkeySupported(): Promise<boolean> {
  try {
    if (!supabase || !passkeyDomainOk() || !window.PublicKeyCredential || !navigator.credentials) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function countPasskeys(): Promise<number | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.passkey.list();
    return error || !Array.isArray(data) ? null : data.length;
  } catch {
    return null;
  }
}

export function passkeyOfferSnoozed(uid: string): boolean {
  try {
    const at = Number(localStorage.getItem(offerKey(uid)));
    return at > 0 && Date.now() - at < OFFER_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozePasskeyOffer(uid: string): void {
  try { localStorage.setItem(offerKey(uid), String(Date.now())); } catch { }
}

export function passkeyCancelled(error: unknown): boolean {
  const e = error as { code?: string; name?: string; cause?: { name?: string } } | null;
  const name = e?.cause?.name ?? e?.name;
  return e?.code === 'ERROR_CEREMONY_ABORTED' || name === 'NotAllowedError' || name === 'AbortError';
}

export function passkeyErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'Passkey untuk akun ini sudah tersimpan di HP ini.';
  if (e?.code === 'ERROR_INVALID_DOMAIN' || e?.code === 'ERROR_INVALID_RP_ID') return `Passkey hanya bisa dipakai di ${RP_ID}.`;
  const msg = e?.message ?? '';
  if (/fetch|network/i.test(msg)) return 'Gagal terhubung ke server. Cek koneksi kamu.';
  if (/not enabled|disabled|not found/i.test(msg)) return 'Fitur passkey belum aktif di server. Hubungi admin.';
  return msg ? `Passkey gagal: ${msg}` : 'Passkey gagal. Coba lagi.';
}

export async function registerDevicePasskey(): Promise<{ ok: true } | { ok: false; message: string | null }> {
  if (!supabase) return { ok: false, message: 'Layanan tidak tersedia.' };
  try {
    const { error } = await supabase.auth.registerPasskey();
    if (!error) return { ok: true };
    return { ok: false, message: passkeyCancelled(error) ? null : passkeyErrorMessage(error) };
  } catch (err) {
    return { ok: false, message: passkeyCancelled(err) ? null : passkeyErrorMessage(err) };
  }
}
