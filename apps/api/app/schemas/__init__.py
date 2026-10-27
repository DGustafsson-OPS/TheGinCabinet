"""Pydantic "schemas": the exact shape of JSON going in and out of the API.

Spec §8 asks for "field-level response DTOs" (DTO = Data Transfer Object).
Returning a schema instead of a database object means we choose *exactly*
which fields leave the server, so private data (like password hashes) can
never leak by accident.
"""
