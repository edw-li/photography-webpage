import hashlib
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from ..config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {"sub": subject, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload dict or None if invalid."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def _password_fingerprint(hashed_password: str) -> str:
    """Return first 16 hex chars of sha256(hashed_password) as a fingerprint."""
    return hashlib.sha256(hashed_password.encode()).hexdigest()[:16]


def create_reset_token(user_id: str, hashed_password: str) -> str:
    """Create a JWT reset token with a password fingerprint for single-use validation."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.reset_token_expire_minutes)
    payload = {
        "sub": user_id,
        "type": "reset",
        "exp": expire,
        "phash": _password_fingerprint(hashed_password),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def verify_reset_token(token: str) -> dict | None:
    """Decode a reset token. Returns payload if valid and type is 'reset', else None."""
    payload = decode_token(token)
    if payload is None or payload.get("type") != "reset":
        return None
    return payload


def hash_token(token: str) -> str:
    """Return the SHA-256 hex digest of a token (used for revocation tracking)."""
    return hashlib.sha256(token.encode()).hexdigest()
