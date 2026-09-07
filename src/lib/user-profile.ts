import { supabase } from './supabase';
import { getCurrentUserId, profileStorageKey } from './session-user';

export const USER_PROFILE_KEY = '@user_profile';

export const GENDERS = ['Male', 'Female'] as const;
export const ACTIVITY_LEVELS = ['Sedentary', 'Light', 'Moderate', 'Active'] as const;
export const PRIMARY_GOALS = ['Lose steadily', 'Maintain', 'Build muscle'] as const;

export type Gender = (typeof GENDERS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];

export type UserProfile = {
  displayName: string;
  height: string;
  weight: string;
  dob: string;
  gender: Gender;
  activityLevel: ActivityLevel;
  primaryGoal: PrimaryGoal;
  /** Locally picked / uploaded profile photo. Highest priority avatar source. */
  avatarUri: string;
  /** Google auth `photo_url`. Used when the user has not uploaded an image. */
  photoUrl: string;
};

export type AvatarSource =
  | { kind: 'image'; uri: string }
  | { kind: 'initials'; initials: string };

export const DEFAULT_PROFILE: UserProfile = {
  displayName: '',
  height: '',
  weight: '',
  dob: '',
  gender: 'Male',
  activityLevel: 'Moderate',
  primaryGoal: 'Maintain',
  avatarUri: '',
  photoUrl: '',
};

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseUserProfile(raw: string | null): UserProfile {
  if (!raw) {
    return { ...DEFAULT_PROFILE };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      displayName: asString(parsed.displayName, DEFAULT_PROFILE.displayName).trim() || DEFAULT_PROFILE.displayName,
      height: asString(parsed.height, DEFAULT_PROFILE.height),
      weight: asString(parsed.weight, DEFAULT_PROFILE.weight),
      dob: asString(parsed.dob, DEFAULT_PROFILE.dob),
      gender: asOneOf(parsed.gender, GENDERS, DEFAULT_PROFILE.gender),
      activityLevel: asOneOf(parsed.activityLevel, ACTIVITY_LEVELS, DEFAULT_PROFILE.activityLevel),
      primaryGoal: asOneOf(parsed.primaryGoal, PRIMARY_GOALS, DEFAULT_PROFILE.primaryGoal),
      avatarUri: asString(parsed.avatarUri, DEFAULT_PROFILE.avatarUri),
      photoUrl: asString(parsed.photoUrl, DEFAULT_PROFILE.photoUrl),
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

async function getAsyncStorage() {
  try {
    const module = await import('@react-native-async-storage/async-storage');
    return module.default ?? null;
  } catch (error) {
    console.warn('AsyncStorage 暂不可用', error);
    return null;
  }
}

export async function loadUserProfile(): Promise<UserProfile> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { ...DEFAULT_PROFILE };
    }

    const AsyncStorage = await getAsyncStorage();
    if (AsyncStorage) {
      const raw = await AsyncStorage.getItem(profileStorageKey(userId));
      if (raw) {
        return parseUserProfile(raw);
      }
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const googleName =
      asString(meta.full_name, '') ||
      asString(meta.name, '') ||
      (typeof user?.email === 'string' ? user.email.split('@')[0] : '');
    const googlePhoto = asString(meta.avatar_url, '') || asString(meta.picture, '');
    const seeded: UserProfile = {
      ...DEFAULT_PROFILE,
      displayName: googleName.trim(),
      photoUrl: googlePhoto.trim(),
    };
    if (AsyncStorage) {
      await AsyncStorage.setItem(profileStorageKey(userId), JSON.stringify(seeded));
    }
    return seeded;
  } catch (error) {
    console.warn('读取个人资料失败，使用默认值', error);
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return;
  }

  const AsyncStorage = await getAsyncStorage();
  if (AsyncStorage) {
    await AsyncStorage.setItem(profileStorageKey(userId), JSON.stringify(profile));
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: profile.displayName,
      avatar_url: profile.avatarUri || profile.photoUrl,
      height: profile.height,
      weight: profile.weight,
      dob: profile.dob,
      gender: profile.gender,
      activity_level: profile.activityLevel,
      primary_goal: profile.primaryGoal,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) {
    console.warn('Skipped Supabase profile upsert', error.message);
  }
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function resolveAvatarSource(profile: Pick<UserProfile, 'avatarUri' | 'photoUrl' | 'displayName'>): AvatarSource {
  const uploaded = profile.avatarUri.trim();
  if (uploaded) {
    return { kind: 'image', uri: uploaded };
  }

  const googlePhoto = profile.photoUrl.trim();
  if (googlePhoto) {
    return { kind: 'image', uri: googlePhoto };
  }

  return { kind: 'initials', initials: initialsFromName(profile.displayName) };
}

export async function updateProfileAvatarInSupabase(avatarUri: string): Promise<void> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !sessionData.user) {
      return;
    }

    const { error } = await supabase.from('profiles').upsert(
      {
        id: sessionData.user.id,
        avatar_url: avatarUri,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Skipped Supabase profile avatar update', error.message);
    }
  } catch (error) {
    console.warn('Skipped Supabase profile avatar update', error);
  }
}

export function dateFromDob(dob: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!match) {
    return new Date(2007, 3, 28);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function dobFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDobDisplay(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function ageFromDob(dob: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);
  if (
    Number.isNaN(birth.getTime()) ||
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) {
    age -= 1;
  }

  return age > 0 && age < 120 ? age : null;
}
