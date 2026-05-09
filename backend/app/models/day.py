from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Day(Base):
    __tablename__ = "days"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    num_trucks: Mapped[int] = mapped_column(Integer, nullable=False)
    truck_capacity: Mapped[float] = mapped_column(Float, nullable=False)
    solver: Mapped[str] = mapped_column(String, nullable=False)
    total_distance: Mapped[float] = mapped_column(Float, nullable=False)
    solve_time_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_request_json: Mapped[str] = mapped_column(Text, nullable=False)
    raw_response_json: Mapped[str] = mapped_column(Text, nullable=False)

    stations: Mapped[list[Station]] = relationship(
        back_populates="day", cascade="all, delete-orphan"
    )
    routes: Mapped[list[Route]] = relationship(
        back_populates="day", cascade="all, delete-orphan"
    )


class Station(Base):
    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    day_id: Mapped[str] = mapped_column(ForeignKey("days.id", ondelete="CASCADE"))
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    demand: Mapped[float] = mapped_column(Float, nullable=False)

    day: Mapped[Day] = relationship(back_populates="stations")


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    day_id: Mapped[str] = mapped_column(ForeignKey("days.id", ondelete="CASCADE"))
    truck_id: Mapped[int] = mapped_column(Integer, nullable=False)
    load: Mapped[float] = mapped_column(Float, nullable=False)
    distance: Mapped[float] = mapped_column(Float, nullable=False)
    sequence_json: Mapped[str] = mapped_column(Text, nullable=False)

    day: Mapped[Day] = relationship(back_populates="routes")
