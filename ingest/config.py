import os
from dataclasses import dataclass
from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    database_url: str
    shared_secret: str
    port: int
    healthcheck_ping_url: str | None

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv()
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not set")
        shared_secret = os.environ.get("INGEST_SHARED_SECRET")
        if not shared_secret:
            raise RuntimeError("INGEST_SHARED_SECRET is not set")
        ping = os.environ.get("HEALTHCHECK_PING_URL") or None
        return cls(
            database_url=database_url,
            shared_secret=shared_secret,
            port=int(os.environ.get("INGEST_PORT", "5000")),
            healthcheck_ping_url=ping,
        )
