"""Inject bank JSON schema loader."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.config import get_settings


@lru_cache
def get_inject_bank_schema() -> dict[str, Any]:
    """Load the inject bank schema from configured JSON file."""
    settings = get_settings()
    schema_path = Path(settings.inject_bank_schema_path)

    if not schema_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Inject bank schema file not found: {schema_path}",
        )

    try:
        with schema_path.open("r", encoding="utf-8") as schema_file:
            schema = json.load(schema_file)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid inject bank schema JSON: {schema_path}",
        ) from exc

    if not isinstance(schema, dict):
        raise HTTPException(status_code=500, detail="Inject bank schema must be a JSON object")

    return schema
