import { NextResponse } from 'next/server';

export function sendApiError(code: string, message: string, status: number = 400) {
  const requestId = crypto.randomUUID(); // Optional: capture trace ID
  
  return NextResponse.json({
    error: {
      code,
      message,
      requestId
    }
  }, { status });
}
