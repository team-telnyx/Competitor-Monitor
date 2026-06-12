"""Inference provider layer for competitor intelligence workflows.

Two providers are supported:

* ``openai``  — the OpenAI **API** (`OPENAI_API_KEY`), billed against API credits.
* ``codex``   — your **ChatGPT subscription**, reached through the same "Sign in with
  ChatGPT" OAuth token that the Codex CLI stores in ``~/.codex/auth.json``. This routes
  inference through ``chatgpt.com/backend-api/codex`` instead of the paid API, so it does
  not consume API credits. (This is the mechanism other ChatGPT-OAuth tools use.)

Selection (see ``get_inference_client``):

* ``INFERENCE_PROVIDER=openai`` forces the API-key path.
* ``INFERENCE_PROVIDER=codex`` forces the ChatGPT-OAuth path.
* Unset (auto): prefer the ChatGPT-OAuth path when ``~/.codex/auth.json`` exists, else
  fall back to the API key.

Keep secrets in local environment variables or a non-committed ``.env`` file; never pass
secrets through source-controlled config.
"""

from __future__ import annotations

import base64
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Protocol

import requests


class InferenceError(RuntimeError):
    """Raised when an inference provider returns an unusable response."""


# =============================================================================
# Relevance rubric (see docs/inference-training.md §2). Bump RUBRIC_VERSION when
# the bands/threshold change so stored scores remain auditable.
# =============================================================================

RUBRIC_VERSION = "v1"
# A page is "relevant" when its score is at/above this. Customer stories/webinars
# (15–39) fall below it by default.
RELEVANCE_THRESHOLD = 40

SIGNAL_TYPES = ["new_product", "new_feature", "update", "tangential", "irrelevant"]

# Canonical taxonomy — mirrors CATEGORIES in dashboard/backend/src/db.ts.
CATEGORIES = [
    "AI Assistants", "Inference", "STT", "TTS", "Voice",
    "Messaging", "Numbers", "Identity", "Fax", "IoT",
    "Networking", "Storage", "Other", "Not Relevant",
]

RUBRIC_BANDS = """- 90-100  new_product: a distinct NEW product launch or flagship capability
- 70-89   new_feature: a new feature, capability, or model version on an EXISTING product
- 40-69   update: an incremental update (performance, pricing, latency, regional rollout)
- 15-39   tangential: a customer story, case study, webinar, or partnership that merely uses a product
- 0-14    irrelevant: careers, legal, brand assets, events, or generic marketing"""


def score_to_relevant(score):
    """Deterministic relevance from a 0–100 score (threshold is the only knob)."""
    try:
        return int(score) >= RELEVANCE_THRESHOLD
    except (TypeError, ValueError):
        return False


def canonicalize_product(product, known_products):
    """Match a model-named product against the registry.

    Returns (canonical_name, category_or_None, is_known). When the name (or an
    alias) is in the registry we lock to the registry's canonical name + category;
    otherwise we keep the model's name and flag it unknown (a candidate product).
    """
    if not product:
        return ("", None, False)
    p = product.strip()
    pl = p.lower()
    for kp in known_products or []:
        name = (kp.get("name") or "").strip()
        if not name:
            continue
        candidates = [name.lower()] + [
            (a or "").lower() for a in (kp.get("aliases") or [])
        ]
        if pl in candidates:
            return (name, kp.get("category"), True)
    return (p, None, False)


class InferenceClient(Protocol):
    """Provider interface used by the monitor pipeline."""

    def classify_pages(
        self,
        *,
        competitor_name: str,
        focus_areas: Iterable[str],
        page_entries: list[dict[str, Any]],
        known_products: list[dict[str, Any]] | None = None,
        guidance: list[str] | None = None,
        examples: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """Return one classification object per page entry."""

    def generate_digest(
        self,
        *,
        focus_areas: Iterable[str],
        relevant_pages: list[dict[str, Any]],
    ) -> str:
        """Return an executive digest for relevant competitor pages."""


# =============================================================================
# Shared prompt construction + response parsing
# =============================================================================


def _format_known_products(known_products: list[dict[str, Any]] | None) -> str:
    if not known_products:
        return "(none on record — infer the product from the page)"
    lines = []
    for kp in known_products:
        name = kp.get("name") or ""
        if not name:
            continue
        cat = kp.get("category") or "?"
        aliases = ", ".join(kp.get("aliases") or [])
        lines.append(f"- {name} — {cat}" + (f" (aka {aliases})" if aliases else ""))
    return "\n".join(lines) if lines else "(none on record)"


def _format_guidance(guidance: list[str] | None) -> str:
    if not guidance:
        return ""
    items = "\n".join(f"- {g}" for g in guidance if g)
    if not items:
        return ""
    return (
        "\nOperator guidance — take this into account when scoring:\n"
        f"{items}\n"
    )


def _format_examples(examples: list[dict[str, Any]] | None) -> str:
    if not examples:
        return ""
    lines = []
    for ex in examples:
        title = ex.get("title", "")
        host = ex.get("host", "")
        verdict = ex.get("verdict", "")
        reason = ex.get("reason")
        line = f'- "{title}" ({host}) → operator marked {verdict}'
        if reason:
            line += f" (reason: {reason})"
        lines.append(line)
    if not lines:
        return ""
    return (
        "\nRecent operator corrections — align your judgments with these:\n"
        + "\n".join(lines)
        + "\n"
    )


def _build_classification_prompt(
    competitor_name: str,
    focus_areas: Iterable[str],
    page_entries: list[dict[str, Any]],
    known_products: list[dict[str, Any]] | None = None,
    guidance: list[str] | None = None,
    examples: list[dict[str, Any]] | None = None,
) -> str:
    focus_areas_str = "\n".join(f"- {fa}" for fa in focus_areas)
    categories_str = ", ".join(f'"{c}"' for c in CATEGORIES)
    return f"""You are a competitive-intelligence analyst classifying new web pages from {competitor_name}.
{_format_guidance(guidance)}{_format_examples(examples)}

Your job is to score how strongly each page signals a NEW PRODUCT or a NEW FEATURE on an existing product, and to identify which product it concerns.

Focus areas we track:
{focus_areas_str}

Relevance rubric — score 0-100, and pick the matching signal_type:
{RUBRIC_BANDS}

Known products for {competitor_name} (match to these EXACTLY when applicable):
{_format_known_products(known_products)}

If a page is clearly about a product that is NOT in the list above and looks brand new, set signal_type "new_product" and give your best product name.

For each page return an object with:
- "index": the page index
- "product": the product name (use the exact known name when it matches), or "" if none applies
- "category": one of {categories_str}
- "signal_type": one of "new_product", "new_feature", "update", "tangential", "irrelevant"
- "relevance_score": an integer 0-100 consistent with the band for that signal_type
- "summary": one sentence on what is new (product/competitive view)
- "reasoning": one sentence justifying the score and signal_type

Be consistent and conservative: only score >= 70 when there is a concrete new product or feature, not a customer story or marketing page.

Pages to classify:
{json.dumps(page_entries, indent=2)}

Respond with ONLY a JSON array of objects, one per page, in the same order. No other text."""


def _build_digest_prompt(
    focus_areas: Iterable[str],
    relevant_pages: list[dict[str, Any]],
) -> str:
    focus_areas_str = "\n".join(f"- {fa}" for fa in focus_areas)
    return f"""You are writing a competitive intelligence digest for a product-led growth team at a telecom/AI company.

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


def parse_json_response(content: str) -> Any:
    """Parse JSON from an LLM response, tolerating code fences and prose preambles."""
    text = content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines:
            lines = lines[1:]
        text = "\n".join(lines)
        if "```" in text:
            text = text.rsplit("```", 1)[0]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the first balanced JSON array/object in the text.
        snippet = _extract_json_snippet(text)
        if snippet is not None:
            return json.loads(snippet)
        raise


def _extract_json_snippet(text: str) -> str | None:
    """Return the substring spanning the first top-level [ ... ] or { ... }."""
    start = None
    opener = None
    for i, ch in enumerate(text):
        if ch in "[{":
            start = i
            opener = ch
            break
    if start is None:
        return None
    closer = "]" if opener == "[" else "}"
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


class _ChatInferenceClient:
    """Mixin: classification + digest built on a provider-specific ``_chat``."""

    def _chat(self, prompt: str, *, max_tokens: int) -> str:  # pragma: no cover
        raise NotImplementedError

    def classify_pages(
        self,
        *,
        competitor_name: str,
        focus_areas: Iterable[str],
        page_entries: list[dict[str, Any]],
        known_products: list[dict[str, Any]] | None = None,
        guidance: list[str] | None = None,
        examples: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        prompt = _build_classification_prompt(
            competitor_name, focus_areas, page_entries, known_products, guidance, examples
        )
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
        prompt = _build_digest_prompt(focus_areas, relevant_pages)
        return self._chat(prompt, max_tokens=2048).strip()


# =============================================================================
# OpenAI API (paid) provider
# =============================================================================


@dataclass(frozen=True)
class OpenAIInferenceClient(_ChatInferenceClient):
    """OpenAI chat-completions client, billed against API credits.

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


# =============================================================================
# ChatGPT subscription (Codex OAuth) provider
# =============================================================================

# Public OAuth client id used by the Codex CLI's "Sign in with ChatGPT" flow.
CODEX_CLIENT_ID = os.getenv("CHATGPT_LOCAL_CLIENT_ID", "app_EMoamEEZ73f0CkXaXp7hrann")
CODEX_TOKEN_URL = os.getenv("CHATGPT_LOCAL_TOKEN_URL", "https://auth.openai.com/oauth/token")
CODEX_BASE_URL = os.getenv("CODEX_BASE_URL", "https://chatgpt.com/backend-api/codex")
# This ChatGPT-account Codex backend serves the frontier gpt-5.4 models, not the
# -codex variants (those return "not supported when using Codex with a ChatGPT account").
CODEX_DEFAULT_MODEL = os.getenv("CODEX_MODEL", "gpt-5.4-mini")
# Refresh when the access token is within this margin of expiry.
_TOKEN_EXPIRY_MARGIN_S = 5 * 60


def _b64url_json(segment: str) -> dict[str, Any] | None:
    try:
        padded = segment + "=" * (-len(segment) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return None


def _jwt_claims(token: str | None) -> dict[str, Any]:
    if not token or token.count(".") != 2:
        return {}
    return _b64url_json(token.split(".")[1]) or {}


def _account_id_from_id_token(id_token: str | None) -> str | None:
    claims = _jwt_claims(id_token)
    auth_claim = claims.get("https://api.openai.com/auth")
    if isinstance(auth_claim, dict):
        acct = auth_claim.get("chatgpt_account_id")
        if isinstance(acct, str) and acct:
            return acct
    return None


def codex_auth_path() -> Path | None:
    """Locate the Codex/ChatGPT OAuth credentials file, if present."""
    for env_var in ("CHATGPT_LOCAL_HOME", "CODEX_HOME"):
        home = os.getenv(env_var)
        if home:
            candidate = Path(home).expanduser() / "auth.json"
            if candidate.exists():
                return candidate
    for candidate in (
        Path.home() / ".chatgpt-local" / "auth.json",
        Path.home() / ".codex" / "auth.json",
    ):
        if candidate.exists():
            return candidate
    return None


@dataclass
class CodexOAuthInferenceClient(_ChatInferenceClient):
    """Inference via the ChatGPT subscription using Codex OAuth credentials.

    Reads (and, when near expiry, refreshes) the access token stored in the Codex
    ``auth.json`` and calls the ChatGPT backend Responses API. No API credits are used.
    """

    auth_path: Path
    model: str = CODEX_DEFAULT_MODEL
    base_url: str = CODEX_BASE_URL
    client_id: str = CODEX_CLIENT_ID
    token_url: str = CODEX_TOKEN_URL
    reasoning_effort: str = "low"
    timeout: int = 180
    instructions: str = (
        "You are a precise product-intelligence assistant. "
        "Follow the user's output-format instructions exactly."
    )

    # -- credential handling -------------------------------------------------

    def _access_token_and_account(self) -> tuple[str, str]:
        data = json.loads(self.auth_path.read_text())
        tokens = data.get("tokens") or {}
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        id_token = tokens.get("id_token")
        account_id = tokens.get("account_id") or _account_id_from_id_token(id_token)

        if self._needs_refresh(access_token) and refresh_token:
            refreshed = self._refresh(refresh_token)
            if refreshed:
                access_token = refreshed.get("access_token") or access_token
                id_token = refreshed.get("id_token") or id_token
                refresh_token = refreshed.get("refresh_token") or refresh_token
                account_id = _account_id_from_id_token(id_token) or account_id
                self._persist(data, access_token, id_token, refresh_token, account_id)

        if not access_token:
            raise InferenceError(
                "No ChatGPT access token found. Run `codex login` to create auth.json."
            )
        if not account_id:
            raise InferenceError(
                "No ChatGPT account id found in auth.json. Run `codex login` again."
            )
        return access_token, account_id

    @staticmethod
    def _needs_refresh(access_token: str | None) -> bool:
        if not access_token:
            return True
        exp = _jwt_claims(access_token).get("exp")
        if isinstance(exp, (int, float)):
            return exp <= time.time() + _TOKEN_EXPIRY_MARGIN_S
        return False

    def _refresh(self, refresh_token: str) -> dict[str, Any] | None:
        try:
            resp = requests.post(
                self.token_url,
                headers={"Content-Type": "application/json"},
                json={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": self.client_id,
                    "scope": "openid profile email offline_access",
                },
                timeout=30,
            )
        except requests.RequestException as exc:
            raise InferenceError(f"ChatGPT token refresh request failed: {exc}") from exc
        if not resp.ok:
            raise InferenceError(
                f"ChatGPT token refresh failed ({resp.status_code}): {resp.text[:300]}"
            )
        payload = resp.json()
        return payload if isinstance(payload, dict) else None

    def _persist(
        self,
        data: dict[str, Any],
        access_token: str,
        id_token: str | None,
        refresh_token: str,
        account_id: str | None,
    ) -> None:
        data.setdefault("tokens", {})
        data["tokens"].update(
            {
                "access_token": access_token,
                "id_token": id_token,
                "refresh_token": refresh_token,
                "account_id": account_id,
            }
        )
        data["last_refresh"] = time.strftime("%Y-%m-%dT%H:%M:%S.000000Z", time.gmtime())
        tmp = self.auth_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=2))
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.auth_path)

    # -- request -------------------------------------------------------------

    def _chat(self, prompt: str, *, max_tokens: int) -> str:
        access_token, account_id = self._access_token_and_account()
        body = {
            "model": self.model,
            "instructions": self.instructions,
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": prompt}]}
            ],
            "stream": True,
            "store": False,
            "reasoning": {"effort": self.reasoning_effort},
        }
        headers = {
            "Authorization": f"Bearer {access_token}",
            "chatgpt-account-id": account_id,
            "OpenAI-Beta": "responses=experimental",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "originator": "codex_cli_rs",
            "User-Agent": "codex_cli_rs/competitor-monitor",
        }
        try:
            resp = requests.post(
                f"{self.base_url.rstrip('/')}/responses",
                headers=headers,
                json=body,
                stream=True,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise InferenceError(f"ChatGPT request failed: {exc}") from exc

        with resp:
            if resp.status_code != 200:
                raise InferenceError(
                    f"ChatGPT backend returned {resp.status_code}: {resp.text[:300]}"
                )
            return self._collect_output_text(resp)

    @staticmethod
    def _collect_output_text(resp: requests.Response) -> str:
        parts: list[str] = []
        done_text: str | None = None
        for raw in resp.iter_lines():
            if not raw:
                continue
            line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
            if not line.startswith("data:"):
                continue
            payload = line[len("data:") :].strip()
            if not payload or payload == "[DONE]":
                continue
            try:
                event = json.loads(payload)
            except json.JSONDecodeError:
                continue
            etype = event.get("type")
            if etype == "response.output_text.delta":
                delta = event.get("delta")
                if isinstance(delta, str):
                    parts.append(delta)
            elif etype == "response.output_text.done":
                text = event.get("text")
                if isinstance(text, str):
                    done_text = text
            elif etype in ("response.failed", "error"):
                detail = json.dumps(event.get("response", event))[:300]
                raise InferenceError(f"ChatGPT backend reported failure: {detail}")
        text = "".join(parts).strip() or (done_text or "").strip()
        if not text:
            raise InferenceError("ChatGPT response contained no output text")
        return text


# =============================================================================
# Provider selection
# =============================================================================


def _openai_client_or_none() -> OpenAIInferenceClient | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAIInferenceClient(
        api_key=api_key,
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )


def _codex_client_or_none() -> CodexOAuthInferenceClient | None:
    path = codex_auth_path()
    if not path:
        return None
    return CodexOAuthInferenceClient(auth_path=path)


def get_inference_client() -> InferenceClient | None:
    """Build the configured inference client, or None when none is available.

    ``INFERENCE_PROVIDER`` forces a provider (``openai`` or ``codex``). When unset, the
    ChatGPT-OAuth (Codex) path is preferred if ``auth.json`` is present, otherwise the
    OpenAI API key is used.
    """
    provider = os.getenv("INFERENCE_PROVIDER", "").strip().lower()
    if provider == "openai":
        return _openai_client_or_none()
    if provider in ("codex", "chatgpt"):
        return _codex_client_or_none()
    return _codex_client_or_none() or _openai_client_or_none()


def describe_active_client(client: InferenceClient | None) -> dict[str, str] | None:
    """Return ``{provider, model}`` metadata for the active client, for run artifacts."""
    if isinstance(client, CodexOAuthInferenceClient):
        return {"provider": "chatgpt-codex-oauth", "model": client.model}
    if isinstance(client, OpenAIInferenceClient):
        return {"provider": "openai", "model": client.model}
    return None
