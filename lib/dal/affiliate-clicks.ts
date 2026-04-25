import { captureException } from '@sentry/browser';

export async function recordClick(input: any) {
  try {
    // Write click to db
  } catch (error) {
    captureException(error, { context: "recordClick.direct-write", input });
  }
}
