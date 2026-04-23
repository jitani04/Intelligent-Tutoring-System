from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
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
    embedding_model: str = Field(default="models/text-embedding-004", alias="EMBEDDING_MODEL")
    embedding_dimensions: int = Field(default=768, alias="EMBEDDING_DIMENSIONS")

    system_prompt: str = Field(default="You are a helpful assistant.", alias="SYSTEM_PROMPT")

    @field_validator("system_prompt", mode="before")
    @classmethod
    def expand_newlines(cls, v: str) -> str:
        return v.replace("\\n", "\n")

    keepalive_seconds: int = Field(default=15, alias="KEEPALIVE_SECONDS")
    upload_dir: Path = Field(default=Path("storage/uploads"), alias="UPLOAD_DIR")
    upload_max_bytes: int = Field(default=10 * 1024 * 1024, alias="UPLOAD_MAX_BYTES")
    rag_top_k: int = Field(default=4, alias="RAG_TOP_K")
    rag_chunk_size: int = Field(default=1200, alias="RAG_CHUNK_SIZE")
    rag_chunk_overlap: int = Field(default=200, alias="RAG_CHUNK_OVERLAP")

    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=10080, alias="JWT_EXPIRE_MINUTES")

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
