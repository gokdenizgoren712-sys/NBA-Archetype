"""JWT + bcrypt auth yardımcıları."""
import logging
import os
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer

from .db import get_conn

# Canlı ortam: Railway/Render kendi değişkenini koyar, elle IS_PROD=true da olur.
IS_PROD = bool(os.environ.get("RAILWAY_ENVIRONMENT")
               or os.environ.get("RENDER") == "true"
               or os.environ.get("IS_PROD") == "true")

# Repo herkese açık: bu varsayılan herkesin elinde. Yalnız yerel geliştirme için.
_DEV_SECRET = "change-me-in-production-please"


def _resolve_secret(raw: str | None, prod: bool) -> str:
    """Canlıda sır yoksa ya da varsayılansa sunucu AÇILMAZ — aksi hâlde herkes
    {"role": "admin"} token'ı imzalayabilir. Kısa sır yalnız uyarı: canlıyı
    ayağa kaldırmamaktansa loga bağırmak daha az zararlı."""
    secret = (raw or "").strip()
    if not prod:
        return secret or _DEV_SECRET
    if not secret or secret == _DEV_SECRET:
        raise RuntimeError("JWT_SECRET is not set for production — refusing to start")
    if len(secret) < 32:
        logging.warning("JWT_SECRET is shorter than 32 characters — rotate it to a long random value")
    return secret


SECRET_KEY          = _resolve_secret(os.environ.get("JWT_SECRET"), IS_PROD)
ALGORITHM           = "HS256"
TOKEN_EXPIRE_DAYS   = 7

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Kullanıcı yokken de bcrypt çalışsın diye (giriş süresi hesabın var olup
# olmadığını ele vermesin) sabit bir sahte özet.
_DUMMY_HASH = pwd_context.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    # Seed kullanıcıların özeti "!" (giriş kapalı): passlib tanımadığı özette
    # hata fırlatıyordu, giriş 500 dönüyordu.
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError):
        return False


def burn_password_check(plain: str) -> None:
    """Hesap yokken de bir bcrypt doğrulaması harca (zamanlama eşitliği)."""
    verify_password(plain, _DUMMY_HASH)


def _token_version(user_id: int) -> int:
    with get_conn() as conn:
        row = conn.execute("SELECT token_version FROM users WHERE id=?", (user_id,)).fetchone()
    return int(row["token_version"] or 0) if row else 0


def create_token(user_id: int, role: str) -> str:
    """tv = users.token_version: şifre değişince/sıfırlanınca artar ve o ana
    kadar verilmiş TÜM token'lar geçersiz olur (çalınmış oturum kesilebilir)."""
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "role": role, "tv": _token_version(user_id), "exp": expire},
                      SECRET_KEY, algorithm=ALGORITHM)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş token")


def _is_banned(user_id: int) -> bool:
    """Token imzası geçerli olsa bile hesap sonradan banlanmış olabilir (token
    TOKEN_EXPIRE_DAYS boyunca kendi başına geçerli kalır) — her istekte DB'den
    tekrar kontrol ediyoruz."""
    with get_conn() as conn:
        row = conn.execute("SELECT is_banned FROM users WHERE id = ?", (user_id,)).fetchone()
    return bool(row and row["is_banned"])


def verify_token(token: str) -> dict:
    """İmza + hesabın BUGÜNKÜ durumu. HTTP ve WebSocket aynı kapıdan geçer.

    - Hesap silinmişse 401; banlıysa 403.
    - Token sürümü DB'dekiyle aynı değilse (şifre değişti) 401.
    - Rol TOKEN'DAN DEĞİL DB'den: yetkisi alınan admin, token'ı dolana kadar
      (7 gün) admin kalmasın; token'daki rol yalnız eski istemciler için.
    """
    payload = _decode(token)
    try:
        uid = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Sign in again")
    with get_conn() as conn:
        row = conn.execute("SELECT role, is_banned, token_version FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Sign in again")
    if row["is_banned"]:
        raise HTTPException(status_code=403, detail="Hesabınız askıya alındı")
    if int(payload.get("tv", 0)) != int(row["token_version"] or 0):
        raise HTTPException(status_code=401, detail="Your session has ended — sign in again")
    payload["role"] = row["role"]
    return payload


def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Giriş gerekli")
    return verify_token(token)


def get_optional_user(token: str = Depends(oauth2_scheme)):
    if not token:
        return None
    try:
        return verify_token(token)
    except HTTPException:
        return None


def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    return user
