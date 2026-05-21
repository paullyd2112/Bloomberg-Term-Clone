import os
import anthropic
import instructor
from pydantic import BaseModel, Field
from typing import Literal
from dotenv import load_dotenv

load_dotenv()

# ─── Instructor-patched Anthropic client ──────────────────────────────────────
_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
client = instructor.from_anthropic(_anthropic)

MODEL = "claude-sonnet-4-6"

# ─── Signal schemas ───────────────────────────────────────────────────────────

class StockSignal(BaseModel):
    direction:     Literal["BUY", "SELL", "HOLD"]
    confidence:    int             = Field(..., ge=0, le=100)
    reasoning:     str             = Field(..., min_length=20)
    time_horizon:  Literal["intraday", "swing", "longterm"]
    key_risk:      str
    news_context:  list[str]       = Field(default_factory=list, max_length=3)


class CryptoSignal(BaseModel):
    direction:        Literal["BUY", "SELL", "HOLD"]
    confidence:       int          = Field(..., ge=0, le=100)
    reasoning:        str          = Field(..., min_length=20)
    time_horizon:     Literal["intraday", "swing", "longterm"]
    sentiment_driver: str
    news_context:     list[str]    = Field(default_factory=list, max_length=3)


class PredictionSignal(BaseModel):
    direction:        Literal["YES", "NO", "HOLD"]
    confidence:       int          = Field(..., ge=0, le=100)
    reasoning:        str          = Field(..., min_length=20)
    time_horizon:     Literal["intraday", "swing", "before_close"]
    edge_detected:    bool
    edge_explanation: str
    news_context:     list[str]    = Field(default_factory=list, max_length=3)


# ─── Score function stub (logic filled in Prompt 6) ───────────────────────────

def score_asset(asset_type: str, identifier: str):
    """
    Fetch context from Supabase, build prompt, call Claude via Instructor,
    write validated signal back. Implemented in Prompt 6.
    """
    pass
