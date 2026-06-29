@AGENTS.md

# DATA SERVICE
- **Railway URL**: `https://bloomberg-term-clone-production.up.railway.app`

# LAUNCH CHECKLIST
- [ ] **Set `ENABLE_SCHEDULER=true` in Railway env vars before going live** — scheduler is OFF by default to avoid burning API credits with no users
- [ ] Verify Anthropic API credits are loaded
- [ ] Confirm Railway is deploying from `main` branch
