export type ForegroundState =
  | 'foreground'
  | 'background'
  | 'inactive'
  | 'unknown';

export interface CrashReportDetails {
  feature: string;
  operationType: string;
  errorCategory: string;
  screenName?: string;
  internalWorkId?: number;
  didCrash?: boolean;
  foregroundState?: ForegroundState;
  retryCount?: number;
  technicalStatusCode?: number;
}

export interface PrivacySafeCrashRecord {
  attributes: Record<string, string>;
  error: Error;
}

const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_.-]{0,79}$/;
const MAX_STACK_FRAMES = 80;

function safeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  return SAFE_IDENTIFIER.test(normalized) ? normalized : fallback;
}

function safeInteger(value: number | undefined): string {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? String(value)
    : 'not_applicable';
}

function extractTechnicalStatusCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const match = error.message.match(/\b(?:http\s*)?([1-5]\d{2})\b/i);
  if (!match) return undefined;
  const statusCode = Number(match[1]);
  return statusCode >= 100 && statusCode <= 599 ? statusCode : undefined;
}

function sanitizeStackFrame(frame: string): string {
  return frame
    .replace(/\bhttps?:\/\/[^\s)]+/gi, '[url]')
    .replace(/\bfile:\/\/\/[^\s)]+/gi, '[local-path]')
    .replace(/\b[A-Z]:\\[^\s)]+/gi, '[local-path]')
    .replace(/\/(?:data|storage|sdcard)\/[^\s)]+/gi, '[local-path]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(
      /([?&](?:token|access_token|id_token|auth|key|code)=)[^&\s)]+/gi,
      '$1[redacted]',
    );
}

function sanitizedError(error: unknown, category: string): Error {
  const safe = new Error(`Crash category: ${category}`);
  safe.name = 'TadayomuSafeError';

  if (error instanceof Error && typeof error.stack === 'string') {
    const frames = error.stack
      .split(/\r?\n/)
      .filter((line) => /^\s*at\s+/i.test(line))
      .slice(0, MAX_STACK_FRAMES)
      .map(sanitizeStackFrame);

    if (frames.length > 0) {
      safe.stack = `${safe.name}: ${safe.message}\n${frames.join('\n')}`;
    }
  }

  return safe;
}

export function createPrivacySafeCrashRecord(
  error: unknown,
  details: CrashReportDetails,
  appVersion: string,
  appVersionCode: string,
  currentForegroundState: ForegroundState,
): PrivacySafeCrashRecord {
  const category = safeIdentifier(details.errorCategory, 'unknown_error');
  const feature = safeIdentifier(details.feature, 'unknown_feature');
  const operationType = safeIdentifier(
    details.operationType,
    'unknown_operation',
  );
  const screenName = details.screenName
    ? safeIdentifier(details.screenName, 'unknown_screen')
    : 'not_applicable';
  const foregroundState =
    details.foregroundState ?? currentForegroundState;
  const statusCode =
    details.technicalStatusCode ?? extractTechnicalStatusCode(error);

  return {
    attributes: {
      app_version: appVersion,
      app_version_code: appVersionCode,
      feature,
      operation_type: operationType,
      error_category: category,
      screen_name: screenName,
      internal_work_id: safeInteger(details.internalWorkId),
      did_crash:
        typeof details.didCrash === 'boolean'
          ? String(details.didCrash)
          : 'not_applicable',
      foreground_state: foregroundState,
      retry_count: safeInteger(details.retryCount),
      technical_status_code: safeInteger(statusCode),
    },
    error: sanitizedError(error, category),
  };
}
