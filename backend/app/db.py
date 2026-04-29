from datetime import datetime
from sqlalchemy import (
    create_engine,
    Column,
    String,
    DateTime,
    Integer,
    Text,
    LargeBinary,
)
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)  # Google sub
    email = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class GoogleToken(Base):
    """Encrypted access + refresh tokens. Refresh token persists across sessions."""

    __tablename__ = "google_tokens"
    user_id = Column(String, primary_key=True)
    access_token_enc = Column(LargeBinary, nullable=False)
    refresh_token_enc = Column(LargeBinary, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    scope = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Classification(Base):
    __tablename__ = "classifications"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, index=True, nullable=False)
    message_id = Column(String, index=True, nullable=False)
    category = Column(String, nullable=False)
    service_name = Column(String)
    subscription_type = Column(String)
    amount = Column(String)
    currency = Column(String)
    frequency = Column(String)
    next_billing_date = Column(String)
    trial_end_date = Column(String)
    cancellation_link = Column(Text)
    sender_email = Column(String)
    priority = Column(String)
    risk_signals = Column(Text)  # JSON-encoded list
    email_snippet = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
