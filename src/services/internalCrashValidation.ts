import { Linking } from 'react-native';
import { reportNonFatal } from './crashReporter';

const VALIDATION_URL_PREFIX =
  'tadayomu-crash-validation://nonfatal';
const handledUrls = new Set<string>();

async function handleCrashValidationUrl(url: string): Promise<void> {
  if (!url.startsWith(VALIDATION_URL_PREFIX) || handledUrls.has(url)) {
    return;
  }
  handledUrls.add(url);

  const parsedUrl = new URL(url);
  const parsedWorkId = Number(parsedUrl.searchParams.get('work_id'));
  const internalWorkId =
    Number.isSafeInteger(parsedWorkId) && parsedWorkId >= 0
      ? parsedWorkId
      : 65023;

  await reportNonFatal(
    new Error('crash_validation_js_non_fatal'),
    {
      feature: 'crash_validation',
      operationType: 'validation_js_record_error',
      errorCategory: 'validation_non_fatal',
      screenName: 'adb_crash_validation',
      internalWorkId,
      didCrash: false,
      retryCount: 0,
      technicalStatusCode: 0,
    },
  );
}

Linking.addEventListener('url', ({ url }) => {
  void handleCrashValidationUrl(url);
});

void Linking.getInitialURL().then((url) => {
  if (url) {
    return handleCrashValidationUrl(url);
  }
});
