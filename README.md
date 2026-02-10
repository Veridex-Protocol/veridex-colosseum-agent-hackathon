# Veridex Solana Agent — Colosseum Agent Hackathon

> Autonomous AI agent powered by the [Veridex Agent SDK](../../packages/agent-sdk) (`@veridex/agentic-payments`). Built for the [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon) — $100k USDC prize pool.

## What It Does

An autonomous AI agent that operates on Solana using the Veridex payment infrastructure:

- **x402 Protocol Payments** — Auto-detects and handles HTTP 402 payment-required responses
- **Multi-Protocol Support** — x402, UCP, ACP, AP2 with automatic protocol detection
- **Session-Key Wallet** — Human-authorized budget-constrained autonomous payments
- **Spending Limits** — Daily and per-transaction caps with real-time alerts
- **Audit Logging** — Full payment trail with CSV/JSON export
- **Heartbeat Sync** — Periodic hackathon status checks, forum engagement, poll responses

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Agent (index.ts)                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Colosseum│  │ Heartbeat│  │  SolanaAgent   │  │
│  │  Client  │  │  Handler │  │  (wallet ops)  │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │          │
│       ▼              ▼                ▼          │
│  Colosseum API   heartbeat.md   @veridex/       │
│  (forum, project,              agentic-payments │
│   teams, polls)                 (AgentWallet)   │
│                                      │          │
│                              ┌───────┴───────┐  │
│                              │ Protocol      │  │
│                              │ Detector      │  │
│                              │ x402│UCP│ACP  │  │
│                              │     │AP2      │  │
│                              └───────────────┘  │
└─────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install dependencies

```bash
cd hackathon/colosseum-agent-hackathon
npm install
```

### 2. Register your agent

```bash
# Register with Colosseum (saves API key — shown ONCE)
npm run register -- veridex-solana-agent
```

Copy the `apiKey` and `claimCode` from the output into your `.env` file:

```bash
cp .env.example .env
# Edit .env with your API key
```

### 3. Set up AgentWallet (for Solana operations)

Follow the [AgentWallet skill](https://agentwallet.mcpay.tech/skill.md) to get a persistent Solana wallet.

### 4. (Optional) Configure Veridex SDK credentials

If you have Veridex passkey credentials for x402 payments, add them to `.env`:

```env
VERIDEX_CREDENTIAL_ID=your_credential_id
VERIDEX_PUBLIC_KEY_X=your_public_key_x
VERIDEX_PUBLIC_KEY_Y=your_public_key_y
VERIDEX_KEY_HASH=your_key_hash
VERIDEX_SESSION_KEY=your_encrypted_session_key
```

### 5. Run the agent

```bash
# Start the agent (heartbeat loop + task execution)
npm run dev

# Or individual commands:
npm run status      # Check agent & hackathon status
npm run heartbeat   # Run a single heartbeat cycle
npm run register    # Register a new agent
```

## SDK Integration

This project uses `@veridex/agentic-payments` (the Veridex Agent SDK) for:

### AgentWallet — Autonomous Payments
```typescript
import { createAgentWallet } from '@veridex/agentic-payments';

const agent = await createAgentWallet({
  masterCredential: { credentialId, publicKeyX, publicKeyY, keyHash },
  session: { dailyLimitUSD: 50, perTransactionLimitUSD: 5, expiryHours: 24, allowedChains: [1] },
});

// Universal fetch — auto-detects x402/UCP/ACP/AP2
const response = await agent.fetch('https://paid-api.example.com/data');

// Direct payment
await agent.pay({ amount: '1000000', token: 'USDC', recipient: '0x...', chain: 10004 });
```

### Multi-Protocol Detection
```typescript
// The SDK automatically detects which payment protocol the server uses
const response = await agent.fetch('https://any-merchant.com/api', {
  onBeforePayment: async (estimate) => {
    console.log(`Cost: $${estimate.amountUSD} via ${estimate.scheme}`);
    return estimate.amountUSD < 10; // auto-approve under $10
  },
  onProtocolDetected: (result) => {
    console.log(`Protocol: ${result.protocol}`); // x402, ucp, acp, or ap2
  },
});
```

### Session Management & Spending Limits
```typescript
const status = agent.getSessionStatus();
// { isValid: true, remainingDailyLimitUSD: 45.50, totalSpentUSD: 4.50, ... }

agent.onSpendingAlert((alert) => {
  console.log(`⚠️ ${alert.message}`); // threshold_reached, limit_exceeded, anomaly_detected
});
```

## Project Structure

```
colosseum-agent-hackathon/
├── agent/
│   └── src/
│       ├── index.ts              # Main entry — lifecycle loop
│       ├── colosseum-client.ts   # Typed Colosseum API wrapper
│       ├── solana-agent.ts       # Veridex SDK integration for Solana
│       ├── heartbeat.ts          # Periodic hackathon sync
│       ├── register.ts           # One-time agent registration
│       └── status.ts             # Quick status check
├── shared/
│   └── types.ts                  # Shared type definitions
├── .env.example                  # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Hackathon Timeline

- **Start**: Feb 2, 2026 12:00 PM EST
- **End**: Feb 12, 2026 12:00 PM EST
- **Duration**: 10 days
- **Prize**: $100,000 USDC

## Tags

`payments` · `ai` · `infra`

## License

MIT — Part of the [Veridex Protocol](https://github.com/Veridex-Protocol/demo)
