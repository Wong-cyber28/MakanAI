export type PendingMealPhoto = {
  uri: string;
  base64: string;
};

export type PendingFixMeal = {
  mealId: string;
  imageUrl: string;
  extraNote: string;
};

type PendingMealIntent =
  | { kind: 'photo'; uri: string; base64: string }
  | { kind: 'fix'; mealId: string; imageUrl: string; extraNote: string }
  | { kind: 'camera' };

let pendingMealIntent: PendingMealIntent | null = null;

export function setPendingMealPhoto(photo: PendingMealPhoto) {
  pendingMealIntent = { kind: 'photo', ...photo };
}

export function requestFixMeal(meal: PendingFixMeal) {
  pendingMealIntent = { kind: 'fix', ...meal };
}

export function requestLiveCamera() {
  pendingMealIntent = { kind: 'camera' };
}

export function consumePendingMealIntent(): PendingMealIntent | null {
  const next = pendingMealIntent;
  pendingMealIntent = null;
  return next;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    result += alphabet[(triple >> 18) & 63];
    result += alphabet[(triple >> 12) & 63];
    result += index + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
    result += index + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }
  return result;
}

export async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not load meal photo');
  }
  const buffer = await response.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}
