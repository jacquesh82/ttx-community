"""JSON schema loading and validation utilities for inject data."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from jsonschema import Draft7Validator
from jsonschema.exceptions import ValidationError
from jsonschema.validators import RefResolver

from app.config import get_settings

INJECT_BANK_SCHEMA_FILENAME = "inject-bank-item.schema.json"
TIMELINE_INJECT_SCHEMA_FILENAME = "timeline-inject-item.schema.json"


class SchemaValidationException(ValueError):
    """Error raised when a JSON payload does not satisfy its schema."""

    def __init__(self, *, path: str, message: str):
        super().__init__(f"{path}: {message}")
        self.path = path
        self.message = message


def _format_error_path(error: ValidationError) -> str:
    """Convert a jsonschema path into a readable '$.a.b[0]' format."""
    parts = ["$"]
    for token in list(error.path):
        if isinstance(token, int):
            parts.append(f"[{token}]")
        else:
            parts.append(f".{token}")
    return "".join(parts)


def _load_json_schema(schema_path: Path) -> dict[str, Any]:
    if not schema_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Schema file not found: {schema_path}",
        )
    try:
        with schema_path.open("r", encoding="utf-8") as schema_file:
            schema = json.load(schema_file)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid schema JSON: {schema_path}",
        ) from exc

    if not isinstance(schema, dict):
        raise HTTPException(status_code=500, detail=f"Schema must be a JSON object: {schema_path}")
    return schema


@lru_cache
def _schemas_base_path() -> Path:
    settings = get_settings()
    schema_path = Path(settings.inject_bank_schema_path).resolve()
    return schema_path.parent


@lru_cache
def get_inject_bank_schema() -> dict[str, Any]:
    """Load the canonical inject-bank item schema."""
    return _load_json_schema(_schemas_base_path() / INJECT_BANK_SCHEMA_FILENAME)


@lru_cache
def get_timeline_inject_schema() -> dict[str, Any]:
    """Load the canonical timeline inject schema."""
    return _load_json_schema(_schemas_base_path() / TIMELINE_INJECT_SCHEMA_FILENAME)


@lru_cache
def _build_validator(schema_name: str) -> Draft7Validator:
    if schema_name == "inject_bank":
        schema = get_inject_bank_schema()
    elif schema_name == "timeline_inject":
        schema = get_timeline_inject_schema()
    else:
        raise ValueError(f"Unknown schema name: {schema_name}")

    bank_schema = get_inject_bank_schema()
    timeline_schema = get_timeline_inject_schema()
    store = {
        str(bank_schema.get("$id")): bank_schema,
        str(timeline_schema.get("$id")): timeline_schema,
    }
    resolver = RefResolver.from_schema(schema, store=store)
    return Draft7Validator(schema=schema, resolver=resolver)


def validate_schema_payload(schema_name: str, payload: Any) -> None:
    """Validate payload and raise SchemaValidationException on first error."""
    validator = _build_validator(schema_name)
    error = next(validator.iter_errors(payload), None)
    if error is None:
        return
    raise SchemaValidationException(path=_format_error_path(error), message=error.message)
