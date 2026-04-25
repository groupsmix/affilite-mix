import { NextResponse } from 'next/server';
import { cronJobs } from './config/cron-registry';

export function middleware(request: Request) {
  const url = new URL(request.url);
  
  // Extract CSRF exempted paths from cron registry
  const csrfExemptPaths = cronJobs
    .filter(job => job.csrfExempt)
    .map(job => job.path);

  if (csrfExemptPaths.includes(url.pathname)) {
    // skip CSRF check
    return NextResponse.next();
  }

  // Other middleware logic
  return NextResponse.next();
}
