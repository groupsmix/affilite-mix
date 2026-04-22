import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { generateTotpSecret, verifyTotpToken } from "@/lib/totp";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import QRCode from "qrcode";

/**
 * POST /api/admin/users/me/totp — enroll in TOTP 2FA.
 * Returns the secret and a data-URL QR code for the authenticator app.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`admin:totp-enroll:${session.userId}`, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
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

    // Generate a new TOTP secret
    const { secret, uri } = generateTotpSecret(session.email);

    // Store the secret (not yet enabled — user must verify first)
    await updateAdminUser(session.userId, {
      totp_secret: secret,
    });

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(uri);

    return NextResponse.json({
      secret,
      qrCode: qrCodeDataUrl,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me/totp] enrollment failed" });
    return NextResponse.json({ error: "Failed to set up 2FA" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users/me/totp — verify TOTP token and enable 2FA.
 * Requires the user to provide a valid token from their authenticator app.
 */
export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`admin:totp-verify:${session.userId}`, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
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

    const isValid = verifyTotpToken(user.totp_secret, token);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Enable 2FA
    await updateAdminUser(session.userId, {
      totp_enabled: true,
      totp_verified_at: new Date().toISOString(),
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
export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const isValid = verifyTotpToken(user.totp_secret, token);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    await updateAdminUser(session.userId, {
      totp_secret: null,
      totp_enabled: false,
      totp_verified_at: null,
    });

    return NextResponse.json({ ok: true, message: "2FA disabled successfully" });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me/totp] disable failed" });
    return NextResponse.json({ error: "Failed to disable 2FA" }, { status: 500 });
  }
}
