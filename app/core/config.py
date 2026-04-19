from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="Chatbot Backend", alias="APP_NAME")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    database_url: str = Field(alias="DATABASE_URL")

    llm_api_key: str = Field(validation_alias=AliasChoices("LLM_API_KEY", "OPENAI_API_KEY"))
    llm_model: str = Field(
        default="gemini-2.5-flash",
        validation_alias=AliasChoices("LLM_MODEL", "OPENAI_MODEL"),
    )
    llm_timeout_seconds: float = Field(
        default=60.0,
        validation_alias=AliasChoices("LLM_TIMEOUT_SECONDS", "OPENAI_TIMEOUT_SECONDS"),
    )

    system_prompt: str = Field(default="You are a helpful assistant.", alias="SYSTEM_PROMPT")
    keepalive_seconds: int = Field(default=15, alias="KEEPALIVE_SECONDS")

    cors_allow_origins_raw: str = Field(
        default="http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173",
        alias="CORS_ALLOW_ORIGINS",
    )

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
