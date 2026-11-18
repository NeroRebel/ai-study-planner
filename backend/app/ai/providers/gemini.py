"""Official Gemini generateContent REST adapter; no automatic SDK tool execution.

Preserve complete model content (including opaque thought signatures) unchanged
through tool rounds. Function responses retain call IDs when supplied by Gemini.
"""
import json
import time
import httpx
from app.ai.base import Generation, ToolCall
from app.core.exceptions import DomainError

class GeminiProvider:
    name = "gemini"
    def __init__(self, settings):
        self.model = settings.ai_model
        self.key = settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else ""
        if not self.key or not self.model:
            raise DomainError("AI Assistant is not configured. Your planner data is unchanged.", 503)

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
        expires=time.monotonic()+timeout
        try:
            with httpx.Client(timeout=httpx.Timeout(timeout), follow_redirects=False) as client:
                # Bounded response reading; do not log URLs, headers or provider error bodies.
                with client.stream("POST", f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                    headers={"x-goog-api-key":self.key}, json=body) as response:
                    if time.monotonic()>=expires: raise httpx.ReadTimeout("Provider deadline reached.")
                    if response.status_code == 429:
                        raise DomainError("AI service is busy. Please try again shortly. Your planner data is unchanged.", 429)
                    if response.status_code != 200:
                        raise DomainError("Could not reach the AI service. Your planner data is unchanged.", 503)
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        if time.monotonic()>=expires: raise httpx.ReadTimeout("Provider deadline reached.")
                        data.extend(chunk)
                        if len(data) > 1_000_000: raise ValueError()
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
        except httpx.TimeoutException:
            raise DomainError("The AI service timed out. Your planner data is unchanged.", 504) from None
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            raise DomainError("The AI service returned an invalid response. Your planner data is unchanged.", 503) from None
