from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env", env_file_encoding="utf-8", extra="ignore",
        hide_input_in_errors=True,
    )

    ai_provider: str = "gemini"
    ai_model: str = Field(default="", pattern=r"^[A-Za-z0-9._-]*$")
    gemini_api_key: SecretStr | None = None
    ai_timeout_seconds: int = Field(default=15, ge=1, le=30)

    supabase_url: str = ""
    supabase_publishable_key: SecretStr | None = None
    supabase_service_role_key: SecretStr | None = None
    database_url: SecretStr | None = None
    direct_url: SecretStr | None = None
    cors_origins: str = "http://localhost:5173"
    app_timezone: str = "Europe/Budapest"
    db_pool_size: int = Field(default=3, ge=1, le=20)
    db_max_overflow: int = Field(default=2, ge=0, le=20)
    db_pool_timeout: int = Field(default=15, ge=1)
    db_pool_recycle: int = Field(default=1800, ge=60)

    @field_validator("supabase_url")
    @classmethod
    def auth_url(cls, value: str) -> str:
        parts = urlsplit(value)
        if value and (parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment or parts.path not in {"", "/"}):
            raise ValueError("SUPABASE_URL must be an HTTPS project origin.")
        return value.rstrip("/")

    @field_validator("database_url", "direct_url", mode="before")
    @classmethod
    def empty_url(cls, value):
        return None if value == "" else value

    @field_validator("app_timezone")
    @classmethod
    def timezone_exists(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("APP_TIMEZONE must be a valid IANA timezone.") from exc
        if value != "Europe/Budapest":
            raise ValueError("Authenticated planning currently requires Europe/Budapest.")
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, value: str) -> str:
        for origin in value.split(","):
            origin = origin.strip()
            parts = urlsplit(origin)
            if (not origin or parts.scheme not in {"http", "https"} or not parts.netloc
                    or parts.path not in {"", "/"} or parts.query or parts.fragment
                    or parts.username or parts.password):
                raise ValueError("CORS_ORIGINS must contain comma-separated HTTP origins.")
        return value

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",")]
