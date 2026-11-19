"""Official Gemini generateContent REST adapter; no automatic SDK tool execution.

Preserve complete model content (including opaque thought signatures) unchanged
through tool rounds. Function responses retain call IDs when supplied by Gemini.
"""
import json
import logging
import math
import random
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
import httpx
from app.ai.base import Generation, ToolCall
from app.ai.errors import ProviderError

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 3
MAX_RETRY_DELAY = 5.0
TRANSIENT_STATUSES = {500, 502, 503, 504}


def retry_after_seconds(value):
    """Support both HTTP delta-seconds and HTTP-date, ignoring invalid headers."""
    if not value:
        return None
    try:
        delay = float(value)
    except ValueError:
        try:
            stamp = parsedate_to_datetime(value)
            if stamp.tzinfo is None:
                return None
            delay = max(0.0, (stamp - datetime.now(UTC)).total_seconds())
        except (ValueError, TypeError, OverflowError):
            return None
    return delay if math.isfinite(delay) and delay >= 0 else None

class GeminiProvider:
    name = "gemini"
    def __init__(self, settings):
        self.model = settings.ai_model
        self.key = settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else ""
        if not self.key or not self.model:
            raise ProviderError("authentication_error")

    def _request(self, body, timeout):
        """Retry only provider communication, never the orchestration/tool loop.

        One immutable wire payload is reused, including already obtained tool
        results/signatures. No tool or database service is called here. All
        attempts and sleeps share the caller's existing per-round deadline.
        """
        expires = time.monotonic() + timeout
        with httpx.Client(follow_redirects=False) as client:
            for attempt in range(1, MAX_ATTEMPTS + 1):
                remaining = expires - time.monotonic()
                if remaining <= 0:
                    raise ProviderError("timeout")
                retry_after = None
                retryable = False
                status = None
                try:
                    with client.stream("POST", f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                        headers={"x-goog-api-key": self.key}, json=body,
                        timeout=httpx.Timeout(remaining)) as response:
                        if time.monotonic() >= expires:
                            raise httpx.ReadTimeout("Provider deadline reached.")
                        status = response.status_code
                        if status != 200:
                            if status == 429:
                                category = "rate_limited"
                            elif status == 504:
                                category = "timeout"
                            elif status in TRANSIENT_STATUSES:
                                category = "transient_unavailable"
                            elif status in {401, 403}:
                                category = "authentication_error"
                            elif 400 <= status < 500:
                                category = "invalid_request"
                            else:
                                category = "provider_error"
                            retryable = status in TRANSIENT_STATUSES or status == 429
                            retry_after = retry_after_seconds(response.headers.get("Retry-After"))
                            raise ProviderError(category, upstream_status=status)
                        data = bytearray()
                        for chunk in response.iter_bytes():
                            if time.monotonic() >= expires:
                                raise httpx.ReadTimeout("Provider deadline reached.")
                            data.extend(chunk)
                            if len(data) > 1_000_000:
                                raise ProviderError("provider_error")
                    if attempt > 1:
                        logger.info("AI provider recovered provider=%s model=%s attempt=%s", self.name, self.model, attempt)
                    return data, attempt
                except ProviderError as error:
                    failure = error
                except httpx.TimeoutException:
                    failure = ProviderError("timeout", upstream_status=status)
                    retryable = True
                except (httpx.NetworkError, httpx.RemoteProtocolError):
                    failure = ProviderError("transient_unavailable", upstream_status=status)
                    retryable = True
                except httpx.HTTPError:
                    failure = ProviderError("provider_error", upstream_status=status)
                # Two sleeps at most: 0.8/1.6s (+ up to 0.2s jitter).
                # Rate limits use 2/4s instead. Never shorten Retry-After to fit
                # our budget: if it is too long, return 429 without retrying.
                base = 2.0 if failure.category == "rate_limited" else 0.8
                delay = base * 2 ** (attempt - 1) + random.uniform(0, 0.2)
                delay = max(delay, retry_after or 0)
                retrying = (retryable and attempt < MAX_ATTEMPTS and delay <= MAX_RETRY_DELAY
                            and delay + 0.1 < expires - time.monotonic())
                logger.warning(
                    "AI provider failure provider=%s model=%s attempt=%s error_type=%s status=%s retrying=%s",
                    self.name, self.model, attempt, failure.category, failure.upstream_status, retrying,
                    extra={"provider": self.name, "model": self.model, "attempt": attempt,
                           "error_type": failure.category, "upstream_status": failure.upstream_status,
                           "retrying": retrying},
                )
                if not retrying:
                    raise failure from None
                time.sleep(delay)

    def generate(self, system, history, tools, continuation, results, timeout):
        contents = []
        for message in history:
            role = "model" if message["role"] == "assistant" else "user"
            # Receipts can create adjacent assistant messages; trimmed replay can
            # start with an assistant. Normalize plain chat only. Never rewrite
            # provider tool content or its opaque thought signatures.
            if not contents and role == "model": continue
            part = {"text":message["content"]}
            if contents and contents[-1]["role"] == role:
                contents[-1]["parts"].append(part)
            else:
                contents.append({"role":role,"parts":[part]})
        base_count = len(contents)
        contents.extend(continuation)
        if results:
            parts = []
            for result in results:
                response = {"name":result["name"], "response":result["result"]}
                if result.get("id"): response["id"] = result["id"]
                parts.append({"functionResponse":response})
            contents.append({"role":"user", "parts":parts})
        body = {"systemInstruction":{"parts":[{"text":system}]}, "contents":contents,
            "tools":[{"functionDeclarations":[{"name":t["name"],"description":t["description"],"parametersJsonSchema":t["parameters"]} for t in tools]}],
            "generationConfig":{"temperature":0.2,"maxOutputTokens":2048}}
        data, attempt = self._request(body, timeout)
        try:
            raw = json.loads(data)
            candidate = raw["candidates"][0]
            if candidate.get("finishReason") not in {None,"STOP"}: raise ValueError()
            content = candidate["content"]
            if content.get("role") != "model" or not isinstance(content["parts"],list): raise ValueError()
            calls, text = [], []
            for part in content["parts"]:
                if "functionCall" in part:
                    call = part["functionCall"]
                    if not isinstance(call.get("name"),str) or not isinstance(call.get("args",{}),dict): raise ValueError()
                    calls.append(ToolCall(call["name"],call.get("args",{}),call.get("id")))
                elif isinstance(part.get("text"),str) and not part.get("thought"):
                    text.append(part["text"])
            return Generation("\n".join(text), calls, [*contents[base_count:], content])
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            logger.warning("AI provider failure provider=%s model=%s attempt=%s error_type=provider_error status=200 retrying=false",
                self.name, self.model, attempt,
                extra={"provider": self.name, "model": self.model, "attempt": attempt,
                       "error_type": "provider_error", "upstream_status": 200, "retrying": False})
            raise ProviderError("provider_error") from None
