import logging

import aiosmtplib
from email.message import EmailMessage

from ..config import settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html_body: str) -> None:
    """Send an email via SMTP if configured, otherwise log to console."""
    if not settings.smtp_configured:
        logger.info("SMTP not configured — email would be sent to %s", to)
        logger.info("Subject: %s", subject)
        logger.info("Body:\n%s", html_body)
        return

    msg = EmailMessage()
    msg["From"] = settings.smtp_from_email
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(html_body, subtype="html")

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_use_tls,
    )


async def send_password_reset_email(to: str, reset_token: str) -> None:
    """Build and send a password-reset email with a link to the frontend."""
    reset_url = f"{settings.frontend_url}/#/reset-password?token={reset_token}"

    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;">
              <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;">
                Reset Your Password
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666;">
                We received a request to reset your password for your
                Bridgeway Photography account.
              </p>
              <a href="{reset_url}"
                 style="display:inline-block;padding:12px 32px;background:#e07a2f;
                        color:#ffffff;text-decoration:none;border-radius:6px;
                        font-weight:600;font-size:14px;">
                Reset Password
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:#999;">
                This link will expire in {settings.reset_token_expire_minutes} minutes.
                If you didn't request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    if not settings.smtp_configured:
        logger.info("=== PASSWORD RESET LINK (no SMTP configured) ===")
        logger.info("Recipient: %s", to)
        logger.info("Reset URL: %s", reset_url)
        logger.info("=== END RESET LINK ===")

    await send_email(to, "Reset Your Password — Bridgeway Photography", html_body)
