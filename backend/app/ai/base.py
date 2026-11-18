"""Provider-neutral orchestration contract. Wire history stays inside the adapter."""
from dataclasses import dataclass, field
from typing import Protocol

@dataclass
class ToolCall:
    name: str
    arguments: dict
    id: str | None = None

@dataclass
class Generation:
    text: str = ""
    calls: list[ToolCall] = field(default_factory=list)
    continuation: object = None

class AIProvider(Protocol):
    name: str
    model: str
    def generate(self, system: str, history: list[dict], tools: list[dict], continuation: list, results: list[dict], timeout: float) -> Generation: ...
