import html
import logging

import aiosmtplib
from email.message import EmailMessage

from ..config import settings

logger = logging.getLogger(__name__)


async def send_email(
    to: str, subject: str, html_body: str, headers: dict[str, str] | None = None
) -> None:
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
    if headers:
        for key, value in headers.items():
            msg[key] = value
    msg.set_content(html_body, subtype="html")

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_use_tls,
    )


async def send_newsletter_email(
    to: str, subscriber_name: str, newsletter_title: str, newsletter_html: str,
    unsubscribe_url: str = "",
) -> None:
    """Build and send a newsletter email to a subscriber."""
    subscriber_name = html.escape(subscriber_name)
    banner_url = f"{settings.frontend_url}/og-banner.jpg"
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#1A2937;text-align:center;">
              <img src="{banner_url}" alt="Selah Photography Club"
                   width="600" style="display:block;width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:14px;color:#666;">
                Hi {subscriber_name},
              </p>
              <h2 style="margin:0 0 20px;font-size:20px;color:#1A2937;">
                {newsletter_title}
              </h2>
              <div style="font-size:14px;color:#333;line-height:1.6;">
                {newsletter_html}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#999;text-align:center;">
                You received this because you're subscribed to Selah Photography Club newsletters.
                <a href="{unsubscribe_url}" style="color:#999;">Unsubscribe</a> from these emails.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    headers = {}
    if unsubscribe_url:
        headers["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

    await send_email(
        to, f"{newsletter_title} — Selah Photography Club", html_body,
        headers=headers if headers else None,
    )


async def send_contact_reply_email(
    to: str, visitor_name: str, reply_text: str, original_message: str
) -> None:
    """Build and send a reply email to a contact-form visitor."""
    import html

    safe_name = html.escape(visitor_name)
    safe_reply = html.escape(reply_text).replace("\n", "<br>")
    safe_original = html.escape(original_message).replace("\n", "<br>")

    banner_url = f"{settings.frontend_url}/og-banner.jpg"
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#1A2937;text-align:center;">
              <img src="{banner_url}" alt="Selah Photography Club"
                   width="600" style="display:block;width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:14px;color:#666;">
                Hi {safe_name},
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#333;">
                Thank you for reaching out. Here is our reply:
              </p>
              <div style="margin:0 0 24px;padding:16px 20px;border-left:4px solid #CD9239;
                          background:#fdf8f0;font-size:14px;color:#333;line-height:1.6;">
                {safe_reply}
              </div>
              <p style="margin:0 0 8px;font-size:12px;color:#999;font-weight:600;text-transform:uppercase;">
                Your original message
              </p>
              <div style="margin:0 0 16px;padding:12px 16px;background:#f4f4f4;
                          border-radius:4px;font-size:13px;color:#666;line-height:1.5;">
                {safe_original}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#999;text-align:center;">
                This is a reply to the message you sent via the Selah Photography Club website.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    await send_email(to, "Re: Your Message — Selah Photography Club", html_body)


async def send_password_reset_email(to: str, reset_token: str) -> None:
    """Build and send a password-reset email with a link to the frontend."""
    reset_url = f"{settings.frontend_url}/#/reset-password?token={reset_token}"

    banner_url = f"{settings.frontend_url}/og-banner.jpg"
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
            <td style="background:#1A2937;text-align:center;">
              <img src="{banner_url}" alt="Selah Photography Club"
                   width="480" style="display:block;width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;">
              <h1 style="margin:0 0 8px;font-size:22px;color:#1A2937;">
                Reset Your Password
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666;">
                We received a request to reset your password for your
                Selah Photography Club account.
              </p>
              <a href="{reset_url}"
                 style="display:inline-block;padding:12px 32px;background:#CD9239;
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

    await send_email(to, "Reset Your Password — Selah Photography Club", html_body)


async def send_verification_email(to: str, name: str, verify_url: str) -> None:
    """Send a subscription verification (double opt-in) email."""
    name = html.escape(name)
    banner_url = f"{settings.frontend_url}/og-banner.jpg"
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
            <td style="background:#1A2937;text-align:center;">
              <img src="{banner_url}" alt="Selah Photography Club"
                   width="480" style="display:block;width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;">
              <p style="margin:0 0 16px;font-size:14px;color:#666;">
                Hi {name},
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#333;">
                Please confirm your newsletter subscription by clicking the button below.
              </p>
              <a href="{verify_url}"
                 style="display:inline-block;padding:12px 32px;background:#CD9239;
                        color:#ffffff;text-decoration:none;border-radius:6px;
                        font-weight:600;font-size:14px;">
                Confirm Subscription
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:#999;">
                If you didn't subscribe, you can safely ignore this email.
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
        logger.info("=== SUBSCRIPTION VERIFICATION LINK (no SMTP configured) ===")
        logger.info("Recipient: %s", to)
        logger.info("Verify URL: %s", verify_url)
        logger.info("=== END VERIFICATION LINK ===")

    await send_email(to, "Confirm Your Subscription — Selah Photography Club", html_body)


async def send_account_verification_email(to: str, first_name: str, verify_url: str) -> None:
    """Send an account email verification email."""
    first_name = html.escape(first_name)
    banner_url = f"{settings.frontend_url}/og-banner.jpg"
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
            <td style="background:#1A2937;text-align:center;">
              <img src="{banner_url}" alt="Selah Photography Club"
                   width="480" style="display:block;width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;">
              <p style="margin:0 0 16px;font-size:14px;color:#666;">
                Hi {first_name},
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#333;">
                Welcome to Selah Photography Club! Please verify your email address
                by clicking the button below.
              </p>
              <a href="{verify_url}"
                 style="display:inline-block;padding:12px 32px;background:#CD9239;
                        color:#ffffff;text-decoration:none;border-radius:6px;
                        font-weight:600;font-size:14px;">
                Verify Email
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:#999;">
                If you didn't create an account, you can safely ignore this email.
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
        logger.info("=== ACCOUNT VERIFICATION LINK (no SMTP configured) ===")
        logger.info("Recipient: %s", to)
        logger.info("Verify URL: %s", verify_url)
        logger.info("=== END VERIFICATION LINK ===")

    await send_email(to, "Verify Your Email — Selah Photography Club", html_body)
