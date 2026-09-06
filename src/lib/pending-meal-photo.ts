export type PendingMealPhoto = {
  uri: string;
  base64: string;
};

type PendingMealIntent =
  | { kind: 'photo'; uri: string; base64: string }
  | { kind: 'camera' };

let pendingMealIntent: PendingMealIntent | null = null;

export function setPendingMealPhoto(photo: PendingMealPhoto) {
  pendingMealIntent = { kind: 'photo', ...photo };
}

export function requestLiveCamera() {
  pendingMealIntent = { kind: 'camera' };
}

export function consumePendingMealIntent(): PendingMealIntent | null {
  const next = pendingMealIntent;
  pendingMealIntent = null;
  return next;
}
