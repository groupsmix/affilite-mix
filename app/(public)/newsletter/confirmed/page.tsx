import { redirect } from "next/navigation";

/**
 * Legacy redirect: /newsletter/confirmed → /newsletter/confirm
 *
 * The /newsletter/confirm page handles both the confirmation flow
 * and the "already confirmed" state. This page exists only to avoid
 * breaking old confirmation links that may still be in subscribers' inboxes.
 */
export default function NewsletterConfirmedRedirect() {
  redirect("/newsletter/confirm");
}
