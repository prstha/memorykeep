/**
 * - `camera`: an ordinary photo
 * - `screenshot`: a screen capture
 * - `messaging`: an image saved from a chat app (WhatsApp, Telegram…), often forwards and memes
 */
export type PhotoKind = 'camera' | 'screenshot' | 'messaging';

const SCREENSHOT = /screenshot|screen_shot|screen shot|screencap/i;
// WhatsApp: IMG-20261012-WA0001.jpg · Telegram: photo_2026-10-12_10-00-00.jpg
const MESSAGING = /-WA\d{4}|^photo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/i;

/** Classifies from the filename, which is enough for the way Android and the major chat apps name files. */
export function photoKind(filename: string | null, isScreenshotSubtype = false): PhotoKind {
  if (isScreenshotSubtype || (filename && SCREENSHOT.test(filename))) return 'screenshot';
  if (filename && MESSAGING.test(filename)) return 'messaging';
  return 'camera';
}
