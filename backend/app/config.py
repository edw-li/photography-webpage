from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/photography"
    secret_key: str = "change-me-to-a-random-secret"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    admin_email: str = "admin@example.com"
    admin_password: str = "changeme123"
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 10
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_tls: bool = True
    reset_token_expire_minutes: int = 5
    frontend_url: str = "http://localhost:5173"

    # Cloudflare Turnstile (optional — CAPTCHA disabled when empty)
    turnstile_site_key: str = ""
    turnstile_secret_key: str = ""

    @property
    def turnstile_enabled(self) -> bool:
        return bool(self.turnstile_site_key and self.turnstile_secret_key)

    # OCI Object Storage (S3-compatible)
    oci_access_key: str = ""
    oci_secret_key: str = ""
    oci_bucket_name: str = ""
    oci_namespace: str = ""
    oci_region: str = ""

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

    @property
    def oci_configured(self) -> bool:
        return bool(self.oci_access_key and self.oci_secret_key and self.oci_bucket_name
                    and self.oci_namespace and self.oci_region)

    @property
    def oci_s3_endpoint(self) -> str:
        return f"https://{self.oci_namespace}.compat.objectstorage.{self.oci_region}.oraclecloud.com"

    @property
    def oci_public_base_url(self) -> str:
        return f"https://objectstorage.{self.oci_region}.oraclecloud.com/n/{self.oci_namespace}/b/{self.oci_bucket_name}/o"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
