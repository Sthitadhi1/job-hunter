---
name: offer-compare
description: Compare job offers side by side (base, variable, joining/retention bonuses, RSUs/ESOPs with vesting and cliff, PF/benefits, take-home) over year 1 and a multi-year horizon with equity scenarios, weigh the non-money factors, and prepare a negotiation plan and counter-offer script. Handles Indian CTC structures (fixed vs variable vs "CTC padding") and other currencies. Use this whenever the user has an offer or several, asks "is this a good offer", "which offer should I take", "how do I negotiate", or pastes an offer letter or CTC breakdown.
---

# Offer comparison

## 1. Get the real numbers

From the offer letters (PDF/text the user shares) or their message, fill `job-hunt/offers.json`
(format documented at the top of `scripts/offer_calc.mjs`). Indian CTCs often bundle things that
aren't cash you'll see monthly. Split them out:
- **base / fixed**: the guaranteed annual salary.
- **variable**: target %, and how it's actually paid (ask or look up the company's typical payout;
  default 80–100%).
- **one-time**: joining bonus (note any clawback period), relocation, retention.
- **employer_retirement**: employer PF (often 12% of basic), gratuity. Real but locked in, so it's
  kept out of cash.
- **benefits_value**: insurance etc. A rough figure is fine.
- **equity**: RSUs (public company: liquid) vs ESOPs (private: illiquid, strike price, exercise
  window). Get grant value, vesting schedule, cliff. Use scenarios `{"bear":0.3,"base":1,"bull":2}`
  for listed RSUs and something like `{"bear":0,"base":0.5,"bull":3}` for early-stage ESOPs.
- **effective_tax_pct**: if the user wants take-home, estimate it for their country and regime
  (look up the current slabs with web search rather than assuming them) and state the assumption.

Ask only for numbers that are missing and matter; mark guesses in `notes`.

## 2. Run the calculator

```bash
node "<this skill's base directory>/scripts/offer_calc.mjs" --offers job-hunt/offers.json --years 4 --out job-hunt/offers.md
```

## 3. Weigh what the numbers don't show

Score each offer 1–5 on: role and scope, team and manager (from interviews), learning and
growth, brand/career signal, product and company health (funding, layoffs, revenue; quick web
search), location/commute/remote, work-life balance (on-call, reviews on Glassdoor/AmbitionBox),
and visa/relocation implications. Ask the user to weight what matters to them (default equal).
Add a short "Decision" section to `offers.md`: the money view, the weighted view, and where they
disagree.

This is a decision aid, not financial advice. Don't tell the user what to do with equity
(exercise, sell, hold); explain the trade-offs and suggest a tax professional for exercise decisions.

## 4. Negotiation plan

- Leverage: competing offers (the strongest numbers from `offers.md`), market data (Levels.fyi,
  Glassdoor, AmbitionBox for the role/level/city), scarce skills from the evaluation.
- What to ask for, in order of how flexible companies usually are: joining bonus, base (within
  band), equity, start date, level/title, relocation, remote days.
- Draft a counter email (warm, specific, one ask with one reason, no ultimatums) and a 3-line
  phone script. Save to `job-hunt/offers-negotiation.md`. The user sends it.
- Then update the tracker: `tracker.mjs set --job <id> --status offer --note "<numbers>"`.
