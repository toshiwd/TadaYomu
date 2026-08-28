import crashlytics from '@react-native-firebase/crashlytics';
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import {
  createPrivacySafeCrashRecord,
  type CrashReportDetails,
  type ForegroundState,
} from './crashPrivacy';

export type { CrashReportDetails } from './crashPrivacy';

type CrashEventName =
  | 'app_initialized'
  | 'background_fetch_started'
  | 'background_fetch_work_started';

function safeInteger(value: number | undefined): string {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? String(value)
    : 'not_applicable';
}

function currentForegroundState(): ForegroundState {
  switch (AppState.currentState) {
    case 'active':
      return 'foreground';
    case 'background':
      return 'background';
    case 'inactive':
      return 'inactive';
    default:
      return 'unknown';
  }
}

function appVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

function appVersionCode(): string {
  return String(Constants.expoConfig?.android?.versionCode ?? 'unknown');
}

export async function initializeCrashReporting(): Promise<void> {
  await crashlytics().setAttributes({
    app_version: appVersion(),
    app_version_code: appVersionCode(),
    feature: 'app_lifecycle',
    operation_type: 'app_initialize',
    foreground_state: currentForegroundState(),
  });
  crashlytics().log('event=app_initialized');
}

export function logCrashEvent(
  event: CrashEventName,
  internalWorkId?: number,
): void {
  try {
    crashlytics().log(
      `event=${event} internal_work_id=${safeInteger(internalWorkId)}`,
    );
  } catch {
    console.warn('[CrashReporter] Safe event log was not recorded.');
  }
}

export async function reportNonFatal(
  error: unknown,
  details: CrashReportDetails,
): Promise<void> {
  try {
    const safeRecord = createPrivacySafeCrashRecord(
      error,
      details,
      appVersion(),
      appVersionCode(),
      currentForegroundState(),
    );

    await crashlytics().setAttributes(safeRecord.attributes);
    crashlytics().log(
      `event=non_fatal feature=${safeRecord.attributes.feature} operation=${safeRecord.attributes.operation_type} category=${safeRecord.attributes.error_category}`,
    );
    crashlytics().recordError(
      safeRecord.error,
      safeRecord.attributes.error_category,
    );
  } catch {
    console.warn('[CrashReporter] Privacy-safe non-fatal was not recorded.');
  }
}
