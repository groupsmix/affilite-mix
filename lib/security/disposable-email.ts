/**
 * A153: Disposable / throwaway email domain blocker.
 *
 * Blocks well-known disposable email services at signup/subscribe time to
 * prevent abuse via throwaway addresses (coupon farming, fake referrals,
 * newsletter spam). The list covers the most-abused providers; for a
 * comprehensive block use an API like Kickbox or MailCheck.ai in conjunction.
 *
 * Rules:
 *   - Block exact domain matches (e.g. "mailinator.com")
 *   - Block known subdomain patterns of abuse (e.g. anything under "guerrillamail.info")
 *   - Allowlist is the OPPOSITE approach — everything not in the blocklist is allowed
 *
 * Sources: https://github.com/disposable-email-domains/disposable-email-domains
 */

// A curated subset of the most-abused disposable email providers.
// Extend this list or replace with a full API check for higher coverage.
const DISPOSABLE_DOMAINS = new Set([
  // Mailinator family
  "mailinator.com",
  "mailinater.com",
  "mailinator2.com",
  "mailinator.net",
  "trashmail.at",
  "trashmail.com",
  "trashmail.io",
  "trashmail.me",
  "trashmail.net",
  "trashmail.org",
  "trash-mail.at",
  // Guerrilla Mail
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "grr.la",
  "spam4.me",
  // 10 Minute Mail family
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "10minutemail.co.uk",
  "10minemail.com",
  "tempr.email",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "tempinbox.com",
  "dispostable.com",
  // Throwam / YopMail
  "yopmail.com",
  "yopmail.fr",
  "cool.fr.nf",
  "jetable.fr.nf",
  "nospam.ze.tc",
  "nomail.xl.cx",
  "mega.zik.dj",
  "speed.1s.fr",
  "courriel.fr.nf",
  "moncourrier.fr.nf",
  // Sharklasers / Guerrilla variants
  "sharklasers.com",
  "guerrillamail.biz",
  "spam.la",
  "spam.su",
  // Misc popular disposables
  "fakeinbox.com",
  "fakeinbox.net",
  "throwam.com",
  "throwam.net",
  "discard.email",
  "discardmail.com",
  "discardmail.de",
  "maildrop.cc",
  "mailnull.com",
  "spamgourmet.com",
  "spamgourmet.net",
  "spamgourmet.org",
  "crap.handcrafted.jp",
  "einrot.com",
  "fleckens.hu",
  "spamevader.com",
  "throwaway.email",
  "gishpuppy.com",
  "mytrashmail.com",
  "mt2009.com",
  "mt2014.com",
  "sogetthis.com",
  "spamoff.de",
  "getonemail.com",
  "getonemail.net",
  "jetable.com",
  "jetable.net",
  "jetable.org",
  "nomail.com",
  "nomail2me.com",
  "objectmail.com",
  "ownmail.net",
  "pookmail.com",
  "safetymail.info",
  "spamdecoy.net",
  "spamfree24.org",
  "spammotel.com",
  "spamtrail.com",
  "tempalias.com",
  "tempemail.biz",
  "tempemail.com",
  "tempemail.net",
  "tempomail.fr",
  "tempymail.com",
  "throwam.com",
  "junk.to",
  "kurzepost.de",
  "objectmail.com",
  "regbypass.com",
  "rmqkr.net",
  "royal.net",
  "spamcon.org",
  "veryrealemail.com",
  "webm4il.info",
  "zoemail.org",
  // Nada / Nada Email
  "nada.email",
  "nadaemail.com",
  // Inboxkitten
  "inboxkitten.com",
  // Burner Mail
  "burnermail.io",
  // Apple Hide My Email domains (not disposable but sometimes used for spam)
  // — do NOT block privaterelay.appleid.com (it's a legitimate forwarding service)
]);

/**
 * Returns true if the given email domain is a known disposable provider.
 *
 * @param email - A normalized (lowercased) email address.
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase();

  // Direct match
  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  // Check parent domain (e.g. user@sub.mailinator.com → mailinator.com)
  const parts = domain.split(".");
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join(".");
    if (DISPOSABLE_DOMAINS.has(parentDomain)) return true;
  }

  return false;
}

/**
 * Returns an error message if the email is disposable, or null if it's allowed.
 * Use at signup/subscribe endpoints.
 */
export function validateNotDisposable(email: string): string | null {
  if (isDisposableEmail(email)) {
    return "Please use a permanent email address. Disposable email services are not accepted.";
  }
  return null;
}
