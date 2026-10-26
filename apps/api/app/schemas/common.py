"""Schemas shared by many endpoints."""

from pydantic import BaseModel, Field


class PageMeta(BaseModel):
    """Pagination metadata (spec §8) so the UI can draw "page 2 of 7"."""

    page: int
    page_size: int
    total: int
    pages: int


class Page[ItemT](BaseModel):
    """A generic "page of results". ``Page[AuditEventOut]`` is a page of audit events.

    ``[ItemT]`` is a *type parameter*: a placeholder for "whatever item type
    this page holds" (Python 3.12+ syntax).
    """

    items: list[ItemT]
    meta: PageMeta


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def meta(self, total: int) -> PageMeta:
        pages = max(1, -(-total // self.page_size))  # -(-a // b) is "divide and round up"
        return PageMeta(page=self.page, page_size=self.page_size, total=total, pages=pages)
