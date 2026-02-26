// src/utils/helpers.ts

/**
 * Format bytes to a human readable string.
 * @param bytes Number of bytes
 * @returns Formatted string (e.g. "1.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format seconds to a human readable time string.
 * @param seconds Number of seconds
 * @returns Formatted string (e.g. "1h 30m" or "45s")
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Parse a time string in "hh:mm:ss", "mm:ss" or "ss" format to seconds.
 * @param str Time string
 * @returns Seconds, or null if parsing fails
 */
export function parseTime(str: string): number | null {
  const parts = str.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return null;
}

/**
 * Extract a VOD ID from a Twitch URL.
 * @param url Twitch URL
 * @returns VOD ID string or null
 */
export function extractVodId(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/videos\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Generate a default Twitch thumbnail URL for a given VOD ID.
 * @param vodId VOD ID
 * @param width Image width
 * @param height Image height
 * @returns Thumbnail URL
 */
export function getThumbnailUrl(vodId: string, width: number = 320, height: number = 180): string {
  return `https://static-cdn.jtvnw.net/cf_vods/${vodId}/thumb/thumb0-${width}x${height}.jpg`;
}

/**
 * Creates an HTML option element.
 * @param value The option value
 * @param label The option label
 * @returns HTMLOptionElement
 */
export function createOption(value: string, label: string): HTMLOptionElement {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}
