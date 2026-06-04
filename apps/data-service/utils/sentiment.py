"""
Batch headline sentiment scoring using Claude Haiku.
Returns scores from -1.0 (very bearish) to 1.0 (very bullish), 0 = neutral.
One API call per batch — cheap and fast.
"""

import os
import anthropic
import instructor
from pydantic import BaseModel
from loguru import logger

_client = instructor.from_anthropic(
    anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
)

HAIKU_MODEL = "claude-haiku-4-5-20251001"


class _SentimentBatch(BaseModel):
    scores: list[float]


def score_headlines(headlines: list[str]) -> list[float]:
    """
    Score a list of headlines in a single Claude Haiku call.
    Returns one float per headline. Falls back to 0.0 on any error.
    """
    if not headlines:
        return []

    try:
        result = _client.chat.completions.create(
            model=HAIKU_MODEL,
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": (
                    f"Score each financial headline from -1.0 (very bearish) "
                    f"to 1.0 (very bullish), 0.0 = neutral. "
                    f"Return exactly {len(headlines)} scores.\n\n"
                    + "\n".join(f"{i+1}. {h}" for i, h in enumerate(headlines))
                ),
            }],
            response_model=_SentimentBatch,
        )
        scores = result.scores[: len(headlines)]
        # Pad if model returned fewer scores than expected
        scores += [0.0] * (len(headlines) - len(scores))
        return [max(-1.0, min(1.0, float(s))) for s in scores]
    except Exception as e:
        logger.warning("Sentiment batch scoring failed ({}), defaulting to 0.0: {}", len(headlines), e)
        return [0.0] * len(headlines)
