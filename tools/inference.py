"""Inference provider layer for competitor intelligence workflows.

The pipeline currently supports OpenAI via ``OPENAI_API_KEY``. Keep API keys in
local environment variables or a non-committed ``.env`` file; never pass secrets
through source-controlled config.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Iterable, Protocol

import requests


class InferenceError(RuntimeError):
    """Raised when an inference provider returns an unusable response."""


class InferenceClient(Protocol):
    """Provider interface used by the monitor pipeline."""

    def classify_pages(
        self,
        *,
        competitor_name: str,
        focus_areas: Iterable[str],
        page_entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Return one classification object per page entry."""

    def generate_digest(
        self,
        *,
        focus_areas: Iterable[str],
        relevant_pages: list[dict[str, Any]],
    ) -> str:
        """Return an executive digest for relevant competitor pages."""


@dataclass(frozen=True)
class OpenAIInferenceClient:
    """OpenAI chat-completions inference client.

    Uses requests instead of the OpenAI SDK so the existing lightweight Python
    dependencies remain sufficient.
    """

    api_key: str
    model: str = "gpt-4o-mini"
    base_url: str = "https://api.openai.com/v1"
    timeout: int = 60

    def _chat(self, prompt: str, *, max_tokens: int) -> str:
        resp = requests.post(
            f"{self.base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": max_tokens,
            },
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise InferenceError("OpenAI response did not include message content") from exc
        if not isinstance(content, str) or not content.strip():
            raise InferenceError("OpenAI response content was empty")
        return content

    def classify_pages(
        self,
        *,
        competitor_name: str,
        focus_areas: Iterable[str],
        page_entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        focus_areas_str = "\n".join(f"- {fa}" for fa in focus_areas)
        prompt = f"""You are classifying new web pages from {competitor_name} for an AI/voice product intelligence digest.

Focus areas we care about:
{focus_areas_str}

For each page below, determine:
1. Is it relevant to any of the focus areas above? (true/false)
2. Which category best fits? (one of: "AI Assistants", "Inference", "STT", "TTS", or "Other AI/Voice" for related but not exact matches, or "Not Relevant")
3. A one-sentence summary of what's new or noteworthy (from a product/competitive intelligence perspective)

Pages to classify:
{json.dumps(page_entries, indent=2)}

Respond with a JSON array of objects, one per page, in the same order:
[
  {{"index": 0, "relevant": true, "category": "TTS", "summary": "..."}}
]

Only output the JSON array, no other text."""
        content = self._chat(prompt, max_tokens=4096)
        parsed = parse_json_response(content)
        if not isinstance(parsed, list):
            raise InferenceError("Classification response was not a JSON array")
        return parsed

    def generate_digest(
        self,
        *,
        focus_areas: Iterable[str],
        relevant_pages: list[dict[str, Any]],
    ) -> str:
        focus_areas_str = "\n".join(f"- {fa}" for fa in focus_areas)
        prompt = f"""You are writing a competitive intelligence digest for a product-led growth team at a telecom/AI company.

Focus areas:
{focus_areas_str}

Here are the new competitor pages detected, already classified:
{json.dumps(relevant_pages, indent=2)}

Write a concise digest organized by focus area. For each area with updates:
- Lead with the most important competitive signal
- Include specific details (features, pricing, performance claims)
- Note which competitor it's from
- Flag anything that requires immediate attention or response

If a focus area has no updates, skip it (don't say "no updates").

End with a "Key Takeaways" section (2-3 bullets max) highlighting what matters most for product strategy.

Keep it under 500 words. Be direct and actionable — this goes to product leadership."""
        return self._chat(prompt, max_tokens=2048).strip()


def parse_json_response(content: str) -> Any:
    """Parse JSON from an LLM response, including fenced code blocks."""
    text = content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines:
            lines = lines[1:]
        text = "\n".join(lines)
        if "```" in text:
            text = text.rsplit("```", 1)[0]
        text = text.strip()
    return json.loads(text)


def get_inference_client() -> InferenceClient | None:
    """Build the configured inference client, or None when no key is present."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAIInferenceClient(
        api_key=api_key,
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )
