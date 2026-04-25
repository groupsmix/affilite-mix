import { NextResponse } from 'next/server';
import { clampPagination } from '../../../../lib/api/pagination';
import { sendApiError } from '../../../../lib/api/error';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  try {
    const { limit, offset } = clampPagination(searchParams);
    
    // DB fetch logic here
    return NextResponse.json({ data: [], limit, offset });
  } catch (err: any) {
    return sendApiError("VALIDATION_ERROR", err.message || "Invalid request", 400);
  }
}
