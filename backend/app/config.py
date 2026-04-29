from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    frontend_url: str = "http://localhost:5173"

    lovable_api_key: str
    token_encryption_key: str  # Fernet key (urlsafe base64, 32 bytes)
    jwt_secret: str

    database_url: str = "sqlite:///./data.db"

    gmail_scope: str = "https://www.googleapis.com/auth/gmail.readonly"
    ai_model: str = "google/gemini-3-flash-preview"
    ai_gateway_url: str = "https://ai.gateway.lovable.dev/v1/chat/completions"


settings = Settings()  # type: ignore[call-arg]
