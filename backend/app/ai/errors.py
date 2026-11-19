"""Safe provider failures; categories are internal, never raw upstream bodies."""
from typing import Literal

from app.core.exceptions import DomainError

ProviderCategory = Literal[
    "transient_unavailable", "rate_limited", "invalid_request",
    "authentication_error", "timeout", "provider_error",
]


class ProviderError(DomainError):
    def __init__(self, category: ProviderCategory, *, upstream_status: int | None = None):
        messages = {
            "transient_unavailable": "Gemini is temporarily unavailable. Try again in a moment.",
            "rate_limited": "The AI service is temporarily rate-limited. Please try again shortly.",
            "invalid_request": "The AI service could not accept this request. Please try again later or contact support.",
            "authentication_error": "The AI service configuration needs attention. Please try again later.",
            "timeout": "The AI service timed out. Please try again in a moment.",
            "provider_error": "The AI service could not complete this request. Please try again in a moment.",
        }
        self.category = category
        self.upstream_status = upstream_status
        status = 429 if category == "rate_limited" else 504 if category == "timeout" else 503
        # Upstream 401/403 must NOT become an application 401/sign-out.
        super().__init__("AI Assistant is unavailable. Your planner data is unchanged. " + messages[category], status)
