import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { generateTotpSecret, verifyTotpToken } from "@/lib/totp";
import { encryptTotpSecret, decryptTotpSecret } from "@/lib/totp-encryption";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import QRCode from "qrcode";

/**
 * POST /api/admin/users/me/totp — enroll in TOTP 2FA.
 * Returns the secret and a data-URL QR code for the authenticator app.
 */
export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin(request);
  if (error) return error;
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // P0-5: failPolicy: "closed" on TOTP enrollment.
  const rl = await checkRateLimit(`admin:totp-enroll:${session.userId}`, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  try {
    const user = await getAdminUserByEmail(session.email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.totp_enabled) {
      return NextResponse.json(
        { error: "2FA is already enabled. Disable it first before re-enrolling." },
        { status: 409 },
      );
    }

    // Generate a new TOTP secret
    const { secret, uri } = generateTotpSecret(session.email);

    // B-01: Encrypt the TOTP secret before storing
    const encryptedSecret = await encryptTotpSecret(secret);

    // Store the encrypted secret (not yet enabled — user must verify first)
    await updateAdminUser(session.userId, {
      totp_secret: encryptedSecret,
    });

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(uri);

    return NextResponse.json({
      secret,
      qrCode: qrCodeDataUrl,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me/totp] enrollment failed" });
    // A6-002 / A7-007: Provide a clear error when TOTP encryption key is missing
    const message =
      err instanceof Error && err.message.includes("TOTP_ENCRYPTION_KEY not set")
        ? "2FA encryption is not configured. Contact your administrator."
        : "Failed to set up 2FA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users/me/totp — verify TOTP token and enable 2FA.
 * Requires the user to provide a valid token from their authenticator app.
 */
export async function PUT(request: NextRequest) {
  const { error, session } = await requireAdmin(request);
  if (error) return error;
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // P0-5: failPolicy: "closed" on TOTP verification.
  const rl = await checkRateLimit(`admin:totp-verify:${session.userId}`, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const token = (bodyOrError.token as string) ?? "";
  if (!token || token.length !== 6) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  try {
    const user = await getAdminUserByEmail(session.email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.totp_secret) {
      return NextResponse.json(
        { error: "2FA enrollment not started. Call POST first." },
        { status: 400 },
      );
    }

    // B-01: Decrypt the stored TOTP secret before verification
    const decryptedSecret = await decryptTotpSecret(user.totp_secret);
    // F4 audit: pass the previously consumed step so the same code can't
    // be replayed within its ~90s window. On first verify after enrollment
    // totp_last_step is null, so the check is a no-op and the new step is
    // returned for persistence.
    const { ok, step } = verifyTotpToken(decryptedSecret, token, {
      lastStep: user.totp_last_step,
    });
    if (!ok) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Enable 2FA + record the consumed step in one round-trip.
    await updateAdminUser(session.userId, {
      totp_enabled: true,
      totp_verified_at: new Date().toISOString(),
      totp_last_step: step,
    });

    return NextResponse.json({ ok: true, message: "2FA enabled successfully" });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me/totp] verification failed" });
    return NextResponse.json({ error: "Failed to verify 2FA" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/me/totp — disable 2FA.
 */
export async function DELETE(request: NextRequest) {
  const { error, session } = await requireAdmin(request);
  if (error) return error;
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // P0-5: failPolicy: "closed" on TOTP disable.
  const rl = await checkRateLimit(`admin:totp-disable:${session.userId}`, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const token = (bodyOrError.token as string) ?? "";
  if (!token || token.length !== 6) {
    return NextResponse.json(
      { error: "A valid TOTP token is required to disable 2FA" },
      { status: 400 },
    );
  }

  try {
    const user = await getAdminUserByEmail(session.email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.totp_secret) {
      return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
    }

    // B-01: Decrypt the stored TOTP secret before verification
    const decryptedSecret = await decryptTotpSecret(user.totp_secret);
    // F4 audit: single-use replay check on disable too — a captured code
    // shouldn't be usable both to disable 2FA and to authenticate later.
    // (We only need `ok` here: the step baseline is cleared on disable below.)
    const { ok } = verifyTotpToken(decryptedSecret, token, {
      lastStep: user.totp_last_step,
    });
    if (!ok) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    await updateAdminUser(session.userId, {
      totp_secret: null,
      totp_enabled: false,
      totp_verified_at: null,
      // F4: clear the step baseline so a future re-enrollment starts fresh.
      totp_last_step: null,
    });

    return NextResponse.json({ ok: true, message: "2FA disabled successfully" });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me/totp] disable failed" });
    return NextResponse.json({ error: "Failed to disable 2FA" }, { status: 500 });
  }
}
