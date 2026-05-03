/**
 * OF-14: Redirect /accessibility to /(public)/accessibility so the
 * accessibility statement is reachable at the expected URL path
 * regardless of route-group nesting.
 */
export { default } from "@/app/(public)/accessibility/page";
export { metadata } from "@/app/(public)/accessibility/page";
