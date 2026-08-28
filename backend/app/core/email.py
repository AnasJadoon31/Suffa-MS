import asyncio
import smtplib
from email.message import EmailMessage
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send an HTML email via SMTP configuration."""
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
        logger.warning(f"SMTP not configured. Skipping email to {to_email} with subject '{subject}'")
        return False

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = settings.smtp_from_email or settings.smtp_user
    msg['To'] = to_email
    msg.set_content("Please enable HTML to view this email.")
    msg.add_alternative(html_content, subtype='html')

    def _send():
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
                logger.info(f"Email successfully sent to {to_email}")
                return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    return await asyncio.to_thread(_send)
