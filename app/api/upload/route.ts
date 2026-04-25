import { sendApiError } from '../../../lib/api/error';
import { NextRequest, NextResponse } from 'next/server';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif'];
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) return sendApiError("VALIDATION_ERROR", "No file provided", 400);
    
    // 40. File upload security audit
    if (file.size > MAX_SIZE) {
      return sendApiError("VALIDATION_ERROR", "File exceeds 5MB limit", 400);
    }
    
    if (!ALLOWED_MIMES.includes(file.type)) {
      return sendApiError("VALIDATION_ERROR", "Invalid MIME type", 400);
    }
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return sendApiError("VALIDATION_ERROR", "Invalid file extension", 400);
    }

    // Path traversal prevention (strip directories)
    const safeName = file.name.replace(/^.*[\\\/]/, '');
    
    // R2 Upload logic
    return NextResponse.json({ ok: true, filename: safeName });
  } catch (err) {
    return sendApiError("UPLOAD_ERROR", "Upload failed", 500);
  }
}
