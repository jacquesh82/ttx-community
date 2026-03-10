"""Shared constants for timeline configuration.

Single source of truth for default inject types/formats and source IDs,
used by both app/seed.py (startup) and scripts/data/timeline.py (CLI).
"""

TIMELINE_DEFAULT_INJECT_TYPES_FORMATS = [
    {"type": "Mail", "formats": ["TXT"], "simulator": "mail"},
    {"type": "SMS", "formats": ["TXT", "IMAGE"], "simulator": "sms"},
    {"type": "Call", "formats": ["AUDIO"], "simulator": "tel"},
    {"type": "Social network", "formats": ["TXT", "VIDEO", "IMAGE"], "simulator": "social"},
    {"type": "TV", "formats": ["VIDEO"], "simulator": "tv"},
    {"type": "Document", "formats": ["TXT", "IMAGE"], "simulator": "mail"},
    {"type": "Annuaire de crise", "formats": ["TXT"], "simulator": None},
    {"type": "Scenario", "formats": ["TXT"], "simulator": None},
]

TIMELINE_DEFAULT_SOURCE_IDS = [
    "fr-press-lemonde", "fr-press-lefigaro", "fr-tv-france24", "fr-tv-bfmtv",
    "fr-gov-gouvernement", "fr-gov-anssi",
    "us-press-nyt", "us-press-wp", "us-tv-cnn", "us-tv-foxnews",
    "us-gov-cisa", "us-gov-whitehouse",
    "de-press-spiegel", "de-press-faz", "de-tv-dw", "de-tv-zdf",
    "de-gov-bsi", "de-gov-bundesregierung",
    "es-press-pais", "es-press-mundo", "es-tv-rtve", "es-tv-antena3",
    "es-gov-incibe", "es-gov-lamoncloa",
    "uk-press-bbcnews", "uk-press-guardian", "uk-tv-skynews", "uk-tv-bbcone",
    "uk-gov-ncsc", "uk-gov-govuk",
]
