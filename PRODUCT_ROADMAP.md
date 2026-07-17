# Plebs.finance Master Product Roadmap (2026-2027)

This document serves as the absolute technical reference, directory structure layout, and implementation guide for the evolution of the Plebs.finance platform.

---

## Architectural Phase Timeline

```
PHASE 0: Launch Day (Next Tuesday, July 21, 2026) ──> [ Pure SaaS / Zero Liability ]
│
▼
PHASE 1: AI Agent SDK (Month 1) ──> [ FastMCP / Developer Integration ]
│
▼
PHASE 2: Local Execution Agent (Month 3) ──> [ Open-Source / Local IP / Webhooks ]
│
▼
PHASE 3: Robo-Brokerage (Post-100k MRR) ──> [ Licensed SEC RIA & MiCA CASP ]
```

---

## Phase 0: The Baseline Launch & Data Terminal
*   **Target Date:** Next Tuesday, July 21, 2026
*   **Regulatory Status:** 100% Compliant (Pure financial information publisher. No execution, no custody).
*   **Target Audience:** Retail crypto traders and prediction market spectators.

### 1. Directory Structure Setup
Ensure our active codebase is laid out as follows:

```
├── scoring/
│   ├── rules_engine.py       # High-frequency, $0-cost technical analysis scans (Hourly)
│   ├── haiku_prescreen.py    # Claude Haiku 4.5 breakout assessment module
│   ├── engine.py             # Claude Sonnet 5 predictive market parser (2x Daily)
│   └── whale_sentinel.py     # Live WebSocket listener for Polymarket CLOB V2 Trades
├── src/
│   ├── components/
│   │   ├── WhaleSentinel.tsx  # Real-time animated ticker component
│   │   ├── SignalCard.tsx     # Display cards for active trade alerts
│   │   └── CreatorLedger.tsx  # Interactive line-chart displaying our $500 bot performance
│   └── pages/
│       ├── api/
│       │   ├── whale-alerts.ts # Serves live Sentinel data
│       │   └── signals.ts      # Serves scored signals (Pro/Elite gated)
│       └── dashboard.tsx       # Unified application dashboard interface
```

### 2. Database Schema (Supabase)
We support four discrete membership tiers: `free`, `pro`, `elite`, and `lifetime`.

#### Profiles Table Extension:
```sql
ALTER TABLE public.profiles
ADD COLUMN subscription_status VARCHAR(255) DEFAULT 'free'
CHECK (subscription_status IN ('free', 'pro', 'elite', 'lifetime'));
```

#### Whale Alerts Table:
```sql
CREATE TABLE public.whale_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_title TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    outcome VARCHAR(50) NOT NULL,
    price NUMERIC(10, 4) NOT NULL,
    size NUMERIC(20, 4) NOT NULL,
    usd_value NUMERIC(20, 2) NOT NULL,
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 3. Tiers & Paywall Logic

* **Pro ($40/mo):** Read-access to the `crypto_signals` database table and live `whale_alerts` API.
* **Elite ($80/mo):** Access to all Pro features + `predictive_signals` database table. Guarantees reservation in the 50-slot automated execution beta.
* **Lifetime ($500 one-time, strictly capped at 10 slots):** Lifetime access to all SaaS features + permanent access to all future automated bot execution software with $0 monthly fees for life.

---

## Phase 1: The AI Agent Extension (Model Context Protocol)

* **Target Timeline:** Month 1 Post-Launch (August 2026)
* **Regulatory Status:** 100% Compliant (Information publisher over programmatic interface).
* **Target Audience:** Quant developers, terminal traders, and AI agent developers.

We expose Plebs' proprietary signals to developer workflows by building an official Model Context Protocol (MCP) server.

```
   ┌───────────────────┐
   │    Claude Code     │ <─── [ Ask: "Are there any SOL breakouts?" ]
   └─────────┬─────────┘
             │ (MCP Protocol)
             ▼
   ┌───────────────────┐
   │  plebs-mcp-server │ ───> Queries Plebs DB ───> Returns 89% Win Signals
   └───────────────────┘
```

### 1. File Structure (`/mcp-server/`)

```
├── mcp-server/
│   ├── pyproject.toml        # Poetry/pip dependency management (mcp, fastmcp, httpx)
│   ├── src/
│   │   ├── __init__.py
│   │   └── server.py         # Main FastMCP server definitions
│   └── README.md             # Developer setup and installation guide
```

### 2. FastMCP Implementation Plan
Build the server script using Anthropic's high-level FastMCP framework:

```python
from fastmcp import FastMCP
import httpx
import os

mcp = FastMCP("Plebs Intelligence")

@mcp.tool()
async def get_crypto_signals(min_prob: float = 0.85) -> str:
    """Fetch active, high-probability crypto breakout alerts from Plebs.finance."""
    api_key = os.getenv("PLEBS_API_KEY")
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://plebs.finance/api/signals?type=crypto&min={min_prob}",
            headers={"Authorization": f"Bearer {api_key}"}
        )
        return response.text

@mcp.resource("plebs://whale-alerts/recent")
def get_recent_whale_activity() -> str:
    """Provides a markdown table of the latest Polymarket transactions exceeding $5,000."""
    # Queries /api/whale-alerts and formats as Markdown
    ...
```

### 3. Market Launch
Submit `plebs-mcp-server` to the official Smithery.ai directory and the Anthropic MCP Registry to generate high-intent organic traffic from developers.

---

## Phase 2: The Non-Custodial "Local Execution" Bot

* **Target Timeline:** Month 3 Post-Launch (October 2026)
* **Regulatory Status:** 100% Compliant (Zero custody. User runs open-source execution software locally).
* **Target Audience:** Elite and Lifetime members looking for hands-off, automated execution.

We deliver fully automated, low-latency execution. By having the client execute trades locally, we bypass US geo-blocking on Polymarket and eliminate centralized security risks.

```
  ┌─────────────────────────────────┐
  │         Plebs Backend           │ (Closed Source / Proprietary Server)
  │  - Runs Claude 10-Gate Engine   │
  │  - Broadcasts Signal Webhooks   │
  └────────────────┬────────────────┘
                   │
                   │ (Secure Webhook with HMAC Signature)
                   ▼
  ┌─────────────────────────────────┐
  │     Open-Source Local Agent     │ (Open Source / Runs on User's local machine)
  │  - Decrypts local API Keys      │
  │  - Submits local orders to API  │
  │  - Uses local IP (No Geo-Block) │
  └─────────────────────────────────┘
```

### 1. Directory Structure (`/local-agent/`)

```
├── local-agent/
│   ├── config.json           # User configuration (Target allocations, risk sizing)
│   ├── .env.encrypted        # Local key vault containing encrypted exchange keys
│   ├── setup_keys.py         # CLI wizard to securely input and encrypt API keys
│   ├── daemon.py             # Event-loop listening for Plebs server webhooks
│   ├── executor/
│   │   ├── clob_v2.py        # Polymarket CLOB V2 order integration (via pUSD)
│   │   └── hyperliquid.py    # Hyperliquid Agent-Wallet signing logic
│   └── Dockerfile            # Container wrapper for 1-click cloud VPS deployments
```

### 2. Key Security (Symmetric AES-256-GCM)
Exchange API keys are encrypted locally using a password-derived key. Keys are never transmitted, cached, or stored on Plebs servers.

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64
import os

def encrypt_key(plain_text: str, password: str) -> str:
    # Key derivation using PBKDF2 (256-bit key)
    key = derive_key_from_password(password)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    encrypted = aesgcm.encrypt(nonce, plain_text.encode(), None)
    return base64.b64encode(nonce + encrypted).decode('utf-8')
```

### 3. Execution Engines

* **Polymarket CLOB V2:** Uses `py-clob-client-v2` pointing to native contract addresses. All transactions utilize pUSD collateral and are executed via decimal scaling parameters.
* **Hyperliquid Perps:** Connects using Hyperliquid's native `ApproveAgent` design. Users authorize a local hot wallet address for trading. The agent can only open and close positions; withdrawal features are physically blocked by smart contract design.

---

## Phase 3: The Enterprise "Robo-Brokerage"

* **Target Timeline:** Scaling Phase (Post-$100k MRR / Venture Funding)
* **Regulatory Status:** Fully Licensed (SEC RIA & EU MiCA CASP Portfolio Manager)
* **Target Audience:** Mainstream institutional and retail investors seeking fully integrated, custodial auto-trading.

We convert the platform into a mainstream, 1-click robo-advisor. Users deposit cash directly on our web dashboard, and our centralized servers manage execution securely on the backend.

### 1. Enterprise Architecture Updates

* **Symmetric HSM Key Management:** Implement hardware security modules (AWS CloudHSM or HashiCorp Vault Enterprise) to securely manage and sign transactions for thousands of accounts concurrently.
* **Residential Proxy Mesh:** Deploy residential, geolocated IP proxies (BrightData, IPRoyal) to route each user's Polymarket transaction through their approved home jurisdiction, mitigating rate-limiting and IP blacklist risks.

### 2. Legal & Regulatory Compliance Stack

* **United States Jurisdiction:**
    * Register as a Registered Investment Adviser (RIA) (Form ADV filing).
    * Register as a Commodity Trading Advisor (CTA) with the CFTC.
    * Partner with qualified crypto custodians (e.g., Coinbase Custody, Anchorage) for fund storage.
* **European Union Jurisdiction (MiCA):**
    * Establish a local EU physical headquarters.
    * Maintain the mandatory CASP prudential capital reserve of €150,000 in liquid cash assets.
    * Implement complete KYC/AML onboarding systems and the EU Travel Rule across all client ledger nodes.
