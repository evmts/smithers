"""API-equivalent estimates from the same committed rate card as the harness.

Subscription runs do not incur these token charges. Reasoning is already part
of output; cached input is already part of input. Price each request separately
when its usage is retained, so crossing a context tier does not price a whole
trial at the final request's rate.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TABLE = Path(__file__).resolve().parents[2] / "packages/smithers/agent/model/src/internal/prices.generated.ts"


def rates(model: str) -> dict[str, Any] | None:
    model = re.sub(r"^openai[:/]", "", model)
    source = TABLE.read_text()
    match = re.search(r"export const modelPrices[^=]*=\s*(\{.*\})\s*$", source, re.S)
    if match is None:
        raise ValueError("committed model rate card is not a JSON object")
    return json.loads(match.group(1)).get(model)


def estimate(model: str, usage: list[dict[str, Any]], at: str | None = None) -> dict[str, Any]:
    """Return an explicit unpriced/missing result rather than inventing tokens."""
    price = rates(model)
    if price is None:
        return {"usd": None, "reason": f"unpriced model: {model}"}
    when = datetime.fromisoformat(at.replace("Z", "+00:00")) if at else datetime.now(timezone.utc)
    if price.get("nextFrom") and when >= datetime.fromisoformat(price["nextFrom"].replace("Z", "+00:00")):
        price = price["next"]
    total = 0.0
    if not isinstance(usage, list):
        return {"usd": None, "reason": "missing request token counts"}
    for tokens in usage:
        if not isinstance(tokens, dict):
            return {"usd": None, "reason": "missing request token counts"}
        counts = [tokens.get(key) for key in ("input", "cached", "output")]
        if any(not isinstance(count, int) or isinstance(count, bool) or count < 0 for count in counts):
            return {"usd": None, "reason": "missing request token counts"}
        prompt, cached, output = counts
        if cached > prompt:
            return {"usd": None, "reason": "cached tokens exceed input"}
        context = tokens.get("context_input", prompt)
        if not isinstance(context, int) or isinstance(context, bool) or context < 0:
            return {"usd": None, "reason": "invalid request context token count"}
        card = price.get("longContext", price) if context >= price.get("longContextFrom", float("inf")) else price
        total += ((prompt - cached) * card["input"] + cached * card["cacheRead"] + output * card["output"]) / 1_000_000
    return {"usd": round(total, 8) if usage else None,
            "basis": "API-equivalent list-price estimate; subscription billing is not per token",
            "source": "packages/smithers/agent/model/src/internal/prices.generated.ts"}
