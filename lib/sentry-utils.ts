import * as Sentry from '@sentry/nextjs';

export function withSentryScope(name: string, fn: () => Promise<void>) {
  return async () => {
    return await Sentry.withScope(async (scope) => {
      scope.setTag("context", name);
      try {
        await fn();
      } catch (error) {
        Sentry.captureException(error);
      }
    });
  };
}
