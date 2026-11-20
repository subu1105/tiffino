import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

/** Dependency-free base64 → bytes (Hermes may lack atob). */
export function base64ToBytes(b64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** Write contents into OUR cache under a clean filename. Everything stays in
 *  our permission scope — Expo Go denies cross-module READs elsewhere. */
export async function writeCacheFile(
  contents: string | Uint8Array,
  filename: string,
): Promise<File> {
  const dest = new File(Paths.cache, filename);
  try {
    if (dest.exists) dest.delete();
  } catch {
    /* stale handle — write() below overwrites anyway */
  }
  await dest.write(contents);
  return dest;
}

/** Share an already-written cache file; falls back to sharing `fallbackText`
 *  as plain text (always works) and reports which path ran. */
export async function shareCachedFile(
  file: File,
  mimeType: string,
  fallbackText: string,
): Promise<'file' | 'text'> {
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error('System sharing unavailable');
    await Sharing.shareAsync(file.uri, { mimeType });
    return 'file';
  } catch (err) {
    // Full cause lands in the Metro terminal for diagnosis.
    console.warn('[tiffino] file share failed, falling back to text share:', err);
    await Share.share({ message: fallbackText });
    return 'text';
  }
}

/** Write + share in one go (CSV exports use this). */
export async function shareFile(opts: {
  contents: string | Uint8Array;
  filename: string;
  mimeType: string;
  fallbackText: string;
}): Promise<'file' | 'text'> {
  const file = await writeCacheFile(opts.contents, opts.filename);
  return shareCachedFile(file, opts.mimeType, opts.fallbackText);
}
