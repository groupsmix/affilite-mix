import { z } from 'zod';
import { sendApiError } from './error';
import { NextRequest } from 'next/server';

export async function validateRequest<T>(req: NextRequest, schema: z.Schema<T>): Promise<T | Response> {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return sendApiError("VALIDATION_ERROR", "Invalid request body: " + JSON.stringify(parsed.error.flatten()), 400);
    }
    
    return parsed.data;
  } catch (err) {
    return sendApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
}
