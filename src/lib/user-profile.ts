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
};

export const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Wong Ying Boy',
  height: '',
  weight: '',
  dob: '2007-04-28',
  gender: 'Male',
  activityLevel: 'Moderate',
  primaryGoal: 'Maintain',
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
    const AsyncStorage = await getAsyncStorage();
    if (!AsyncStorage) {
      return { ...DEFAULT_PROFILE };
    }

    const raw = await AsyncStorage.getItem(USER_PROFILE_KEY);
    return parseUserProfile(raw);
  } catch (error) {
    console.warn('读取个人资料失败，使用默认值', error);
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const AsyncStorage = await getAsyncStorage();
  if (!AsyncStorage) {
    return;
  }

  await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
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
