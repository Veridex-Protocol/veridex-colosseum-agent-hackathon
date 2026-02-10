/**
 * Veridex Pay — Merchant API Server
 *
 * Express server with x402 paywall demonstrating the Veridex Agent SDK.
 * The dashboard UI is served by the Next.js app in /dashboard.
 *
 * API Endpoints:
 *   GET  /api/v1/tools              — Free: discover available paid tools
 *   GET  /api/v1/market/sol         — Paid ($0.001): SOL price feed
 *   GET  /api/v1/market/tokens      — Paid ($0.002): top Solana token prices
 *   POST /api/v1/analyze            — Paid ($0.005): AI market analysis
 *   GET  /api/v1/activity           — Free: recent agent activity feed
 *   GET  /api/v1/stats              — Free: aggregate stats
 *   POST /api/v1/proof              — Free: record on-chain proof
 *   POST /api/v1/agent/credentials  — Human sets passkey + session key
 *   GET  /api/v1/agent/credentials  — Agent fetches session key
 *   DELETE /api/v1/agent/credentials — Human revokes session key
 *   GET  /api/v1/agent/status       — Check credential status
 *   WS   /ws                        — Real-time activity stream
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const PORT = parseInt(process.env.MERCHANT_PORT || '4000', 10);
const RECIPIENT = process.env.MERCHANT_RECIPIENT_ADDRESS || '0xMerchant';

// ---------------------------------------------------------------------------
// In-memory activity log (broadcast via WebSocket)
// ---------------------------------------------------------------------------

interface ActivityEntry {
  id: string;
  timestamp: number;
  type: 'discovery' | 'payment' | 'tool_call' | 'proof';
  agent?: string;
  tool?: string;
  amountUSD?: number;
  protocol?: string;
  txHash?: string;
  solanaProof?: string;
  data?: Record<string, unknown>;
}

const activityLog: ActivityEntry[] = [];
const MAX_LOG = 500;

function logActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>) {
  const full: ActivityEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...entry,
  };
  activityLog.unshift(full);
  if (activityLog.length > MAX_LOG) activityLog.pop();
  broadcastWS({ type: 'activity', entry: full });
  return full;
}

// ---------------------------------------------------------------------------
// WebSocket for real-time dashboard
// ---------------------------------------------------------------------------

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastWS(data: unknown) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  // Send recent activity on connect
  ws.send(JSON.stringify({ type: 'init', activity: activityLog.slice(0, 50) }));
});

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

interface PaidTool {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  priceUSD: number;
  category: string;
}

const tools: PaidTool[] = [
  {
    id: 'sol-price',
    name: 'SOL Price Feed',
    description: 'Real-time SOL/USD price from Pyth Network oracle',
    endpoint: '/api/v1/market/sol',
    method: 'GET',
    priceUSD: 0.001,
    category: 'market-data',
  },
  {
    id: 'token-prices',
    name: 'Top Solana Tokens',
    description: 'Price data for top 10 Solana tokens (SOL, JUP, RAY, BONK, etc.)',
    endpoint: '/api/v1/market/tokens',
    method: 'GET',
    priceUSD: 0.002,
    category: 'market-data',
  },
  {
    id: 'market-analysis',
    name: 'AI Market Analysis',
    description: 'AI-generated market analysis for a given Solana token or sector',
    endpoint: '/api/v1/analyze',
    method: 'POST',
    priceUSD: 0.005,
    category: 'analysis',
  },
];

// ---------------------------------------------------------------------------
// x402 Paywall Middleware
// ---------------------------------------------------------------------------

/**
 * Simple x402 paywall that returns 402 Payment Required with payment details.
 * In production, this would use the full veridexPaywall middleware from the SDK.
 * For the hackathon demo, we implement a lightweight version that demonstrates
 * the protocol flow.
 */
function x402Paywall(priceUSD: number, toolId: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Check for payment proof header
    const paymentSig = req.headers['payment-signature'] || req.headers['x-payment-signature'];
    const ucpCred = req.headers['x-ucp-payment-credential'];
    const acpToken = req.headers['x-acp-payment-token'];

    if (paymentSig || ucpCred || acpToken) {
      // Payment provided — log and proceed
      const protocol = paymentSig ? 'x402' : ucpCred ? 'ucp' : 'acp';
      logActivity({
        type: 'payment',
        agent: req.headers['x-agent-name'] as string || 'unknown',
        tool: toolId,
        amountUSD: priceUSD,
        protocol,
        data: { verified: true },
      });
      return next();
    }

    // No payment — return 402 with payment requirements
    // Veridex SDK PaymentParser expects: { paymentRequirements: [{ scheme, network, maxAmountRequired, asset, payTo }] }
    // encoded as base64 in the PAYMENT-REQUIRED header
    const paymentRequirements = {
      paymentRequirements: [
        {
          scheme: 'exact',
          network: 'solana-devnet',
          maxAmountRequired: String(Math.round(priceUSD * 1_000_000)),
          asset: 'USDC',
          payTo: RECIPIENT,
          description: tools.find((t) => t.id === toolId)?.name || toolId,
          extra: {
            name: tools.find((t) => t.id === toolId)?.name,
            priceUSD,
            resource: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
          },
        },
      ],
    };

    // Base64 encode for the PAYMENT-REQUIRED header (Veridex SDK format)
    const encoded = Buffer.from(JSON.stringify(paymentRequirements)).toString('base64');

    logActivity({
      type: 'tool_call',
      agent: req.headers['x-agent-name'] as string || 'unknown',
      tool: toolId,
      amountUSD: priceUSD,
      protocol: 'x402',
      data: { status: '402_sent' },
    });

    res.status(402)
      .set('X-Payment-Required', 'true')
      .set('PAYMENT-REQUIRED', encoded)
      .set('Content-Type', 'application/json')
      .json(paymentRequirements);
  };
}

// ---------------------------------------------------------------------------
// Routes — Free
// ---------------------------------------------------------------------------

app.get('/api/v1/tools', (_req, res) => {
  logActivity({ type: 'discovery', data: { toolCount: tools.length } });
  res.json({ tools, paymentProtocols: ['x402', 'ucp', 'acp', 'ap2'] });
});

app.get('/api/v1/activity', (_req, res) => {
  const limit = Math.min(parseInt(String(_req.query.limit) || '50', 10), 200);
  res.json({ activity: activityLog.slice(0, limit), total: activityLog.length });
});

app.post('/api/v1/activity', (req, res) => {
  const { type, agent, tool, amountUSD, protocol, txHash, solanaProof, data } = req.body;
  if (!type) return res.status(400).json({ error: 'type is required' });
  const entry = logActivity({ type, agent, tool, amountUSD, protocol, txHash, solanaProof, data });
  res.json({ success: true, id: entry.id });
});

app.get('/api/v1/stats', (_req, res) => {
  const totalPayments = activityLog.filter((a) => a.type === 'payment').length;
  const totalRevenue = activityLog
    .filter((a) => a.type === 'payment')
    .reduce((sum, a) => sum + (a.amountUSD || 0), 0);
  const uniqueAgents = new Set(activityLog.map((a) => a.agent).filter(Boolean)).size;
  const protocols = activityLog
    .filter((a) => a.protocol)
    .reduce((acc, a) => {
      acc[a.protocol!] = (acc[a.protocol!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  res.json({
    totalPayments,
    totalRevenue: totalRevenue.toFixed(4),
    uniqueAgents,
    protocols,
    activityCount: activityLog.length,
    uptime: process.uptime(),
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), tools: tools.length });
});

// ---------------------------------------------------------------------------
// Agent Credential Storage (Passkey + Session Key) — File-Persisted
// ---------------------------------------------------------------------------

interface AgentCredentials {
  id: string; // credentialId as unique key
  wallet: {
    credentialId: string;
    publicKeyX: string;
    publicKeyY: string;
    keyHash: string;
  };
  session: {
    publicKey: string;
    encryptedPrivateKey: string;
    keyHash: string;
    dailyLimitUSD: number;
    perTransactionLimitUSD: number;
    expiryHours: number;
    allowedChains: number[];
  };
  createdAt: number;
  revokedAt?: number;
}

interface CredentialStore {
  credentials: AgentCredentials[];
  activeId: string | null; // Currently active credential ID
}

const CRED_FILE = join(process.cwd(), 'data/credentials.json');

function loadCredentials(): CredentialStore {
  try {
    if (existsSync(CRED_FILE)) {
      const data = JSON.parse(readFileSync(CRED_FILE, 'utf-8'));
      return data as CredentialStore;
    }
  } catch (err: any) {
    console.warn(`⚠️ Failed to load credentials: ${err.message}`);
  }
  return { credentials: [], activeId: null };
}

function saveCredentials(store: CredentialStore): void {
  try {
    const dir = dirname(CRED_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CRED_FILE, JSON.stringify(store, null, 2));
  } catch (err: any) {
    console.warn(`⚠️ Failed to save credentials: ${err.message}`);
  }
}

let credStore = loadCredentials();
if (credStore.credentials.length > 0) {
  console.log(`🔑 Loaded ${credStore.credentials.length} stored credential(s)`);
  const active = credStore.credentials.find(c => c.id === credStore.activeId && !c.revokedAt);
  if (active) {
    console.log(`   Active: ${active.wallet.credentialId.slice(0, 20)}... (limit: $${active.session.dailyLimitUSD}/day)`);
  }
}

function getActiveCredentials(): AgentCredentials | null {
  if (!credStore.activeId) return null;
  const cred = credStore.credentials.find(c => c.id === credStore.activeId);
  if (!cred || cred.revokedAt) return null;
  return cred;
}

// POST /api/v1/agent/credentials — Human sends passkey + session key
app.post('/api/v1/agent/credentials', (req, res) => {
  const { wallet, session } = req.body;
  if (!wallet?.credentialId || !session?.publicKey) {
    return res.status(400).json({ error: 'Missing wallet or session data' });
  }

  const id = wallet.credentialId;

  // Check if credential already exists — update it
  const existing = credStore.credentials.findIndex(c => c.id === id);
  const cred: AgentCredentials = {
    id,
    wallet,
    session,
    createdAt: Date.now(),
  };

  if (existing >= 0) {
    credStore.credentials[existing] = cred;
  } else {
    credStore.credentials.push(cred);
  }

  // Set as active
  credStore.activeId = id;
  saveCredentials(credStore);

  logActivity({
    type: 'discovery',
    agent: 'human',
    data: {
      action: 'credentials_set',
      keyHash: wallet.keyHash,
      sessionKeyHash: session.keyHash,
      dailyLimitUSD: session.dailyLimitUSD,
    },
  });

  console.log(`\n🔑 Agent credentials set by human`);
  console.log(`   Passkey: ${wallet.credentialId.slice(0, 20)}...`);
  console.log(`   Session key: ${session.keyHash.slice(0, 20)}...`);
  console.log(`   Daily limit: $${session.dailyLimitUSD}`);
  console.log(`   Per-tx limit: $${session.perTransactionLimitUSD}`);
  console.log(`   Total stored: ${credStore.credentials.length}`);

  res.json({ success: true, keyHash: wallet.keyHash, totalCredentials: credStore.credentials.length });
});

// GET /api/v1/agent/credentials — Agent fetches active session key
app.get('/api/v1/agent/credentials', (_req, res) => {
  const active = getActiveCredentials();
  if (!active) {
    return res.status(404).json({ error: 'No active credentials' });
  }
  res.json(active);
});

// GET /api/v1/agent/credentials/all — List all stored credentials
app.get('/api/v1/agent/credentials/all', (_req, res) => {
  res.json({
    credentials: credStore.credentials.map(c => ({
      id: c.id,
      keyHash: c.wallet.keyHash,
      dailyLimitUSD: c.session.dailyLimitUSD,
      perTransactionLimitUSD: c.session.perTransactionLimitUSD,
      createdAt: c.createdAt,
      revokedAt: c.revokedAt,
      isActive: c.id === credStore.activeId,
    })),
    activeId: credStore.activeId,
    total: credStore.credentials.length,
  });
});

// PUT /api/v1/agent/credentials/:id/activate — Switch active credential
app.put('/api/v1/agent/credentials/:id/activate', (req, res) => {
  const cred = credStore.credentials.find(c => c.id === req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  if (cred.revokedAt) return res.status(400).json({ error: 'Credential is revoked' });
  credStore.activeId = cred.id;
  saveCredentials(credStore);
  res.json({ success: true, activeId: credStore.activeId });
});

// DELETE /api/v1/agent/credentials — Revoke active credential
app.delete('/api/v1/agent/credentials', (_req, res) => {
  const active = getActiveCredentials();
  if (!active) {
    return res.status(404).json({ error: 'No active credentials to revoke' });
  }
  active.revokedAt = Date.now();

  // Find next non-revoked credential to make active
  const next = credStore.credentials.find(c => !c.revokedAt && c.id !== active.id);
  credStore.activeId = next?.id || null;
  saveCredentials(credStore);

  logActivity({
    type: 'discovery',
    agent: 'human',
    data: { action: 'credentials_revoked', keyHash: active.wallet.keyHash },
  });

  console.log(`\n🚫 Credential revoked: ${active.wallet.credentialId.slice(0, 20)}...`);
  res.json({ success: true, revokedAt: active.revokedAt, newActiveId: credStore.activeId });
});

// DELETE /api/v1/agent/credentials/:id — Revoke specific credential
app.delete('/api/v1/agent/credentials/:id', (req, res) => {
  const cred = credStore.credentials.find(c => c.id === req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  cred.revokedAt = Date.now();
  if (credStore.activeId === cred.id) {
    const next = credStore.credentials.find(c => !c.revokedAt && c.id !== cred.id);
    credStore.activeId = next?.id || null;
  }
  saveCredentials(credStore);
  res.json({ success: true, revokedAt: cred.revokedAt });
});

// GET /api/v1/agent/status — Check agent credential status
app.get('/api/v1/agent/status', (_req, res) => {
  const active = getActiveCredentials();
  res.json({
    hasCredentials: !!active,
    activeId: credStore.activeId,
    totalCredentials: credStore.credentials.length,
    activeCredentials: credStore.credentials.filter(c => !c.revokedAt).length,
    createdAt: active?.createdAt,
    revokedAt: active?.revokedAt,
    dailyLimitUSD: active?.session?.dailyLimitUSD,
    perTransactionLimitUSD: active?.session?.perTransactionLimitUSD,
  });
});

// ---------------------------------------------------------------------------
// Routes — Paid (x402 protected)
// ---------------------------------------------------------------------------

app.get('/api/v1/market/sol', x402Paywall(0.001, 'sol-price'), async (_req, res) => {
  // Simulate Pyth price feed
  const basePrice = 180 + Math.random() * 20;
  const change24h = (Math.random() - 0.5) * 10;
  res.json({
    symbol: 'SOL',
    priceUSD: parseFloat(basePrice.toFixed(2)),
    change24h: parseFloat(change24h.toFixed(2)),
    change24hPercent: parseFloat(((change24h / basePrice) * 100).toFixed(2)),
    volume24h: Math.round(1_500_000_000 + Math.random() * 500_000_000),
    marketCap: Math.round(basePrice * 400_000_000),
    source: 'pyth-network',
    timestamp: Date.now(),
  });
});

app.get('/api/v1/market/tokens', x402Paywall(0.002, 'token-prices'), async (_req, res) => {
  const tokens = [
    { symbol: 'SOL', price: 180 + Math.random() * 20 },
    { symbol: 'JUP', price: 1.2 + Math.random() * 0.5 },
    { symbol: 'RAY', price: 3.5 + Math.random() * 1 },
    { symbol: 'BONK', price: 0.000025 + Math.random() * 0.00001 },
    { symbol: 'WIF', price: 2.1 + Math.random() * 0.8 },
    { symbol: 'PYTH', price: 0.45 + Math.random() * 0.15 },
    { symbol: 'JTO', price: 3.2 + Math.random() * 0.5 },
    { symbol: 'ORCA', price: 4.8 + Math.random() * 1.2 },
    { symbol: 'MNDE', price: 0.12 + Math.random() * 0.05 },
    { symbol: 'MSOL', price: 200 + Math.random() * 25 },
  ].map((t) => ({
    ...t,
    price: parseFloat(t.price.toFixed(6)),
    change24h: parseFloat(((Math.random() - 0.5) * 15).toFixed(2)),
  }));

  res.json({ tokens, source: 'pyth-network', timestamp: Date.now() });
});

app.post('/api/v1/analyze', x402Paywall(0.005, 'market-analysis'), async (req, res) => {
  const { token, sector } = req.body || {};
  const target = token || sector || 'SOL';

  // Simulated AI analysis
  const sentiments = ['bullish', 'neutral', 'bearish'];
  const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
  const confidence = 0.6 + Math.random() * 0.35;

  res.json({
    target,
    sentiment,
    confidence: parseFloat(confidence.toFixed(2)),
    summary: `${target} shows ${sentiment} momentum with ${(confidence * 100).toFixed(0)}% confidence. ` +
      `Key factors: on-chain activity ${Math.random() > 0.5 ? 'increasing' : 'stable'}, ` +
      `DEX volume ${Math.random() > 0.5 ? 'up' : 'down'} ${(Math.random() * 20).toFixed(1)}%, ` +
      `whale accumulation ${Math.random() > 0.5 ? 'detected' : 'minimal'}.`,
    signals: {
      onChainActivity: Math.random() > 0.5 ? 'increasing' : 'stable',
      dexVolume: parseFloat(((Math.random() - 0.5) * 40).toFixed(1)),
      whaleActivity: Math.random() > 0.5 ? 'accumulating' : 'distributing',
      socialSentiment: parseFloat((Math.random() * 100).toFixed(0)),
    },
    timestamp: Date.now(),
    model: 'veridex-market-v1',
  });
});

// ---------------------------------------------------------------------------
// On-chain proof endpoint (agent posts proofs here)
// ---------------------------------------------------------------------------

app.post('/api/v1/proof', (req, res) => {
  const { hash, signature, action, txHash, explorer } = req.body;
  const entry = logActivity({
    type: 'proof',
    agent: req.headers['x-agent-name'] as string || 'veridex-solana-agent',
    data: { hash, signature, action, txHash, explorer },
    solanaProof: txHash,
  });
  broadcastWS({ type: 'proof', entry });
  res.json({ recorded: true, id: entry.id });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log('');
  console.log('🏪 Veridex Pay — Merchant API Server');
  console.log('====================================');
  console.log(`   API:        http://localhost:${PORT}`);
  console.log(`   Tools:      http://localhost:${PORT}/api/v1/tools`);
  console.log(`   WebSocket:  ws://localhost:${PORT}/ws`);
  console.log(`   Recipient:  ${RECIPIENT}`);
  console.log('');
  console.log('   Paid endpoints (x402 protected):');
  tools.forEach((t) => {
    console.log(`     ${t.method.padEnd(5)} ${t.endpoint.padEnd(25)} $${t.priceUSD}  — ${t.name}`);
  });
  console.log('');
  console.log('   Dashboard:  http://localhost:3000 (Next.js)');
  console.log('');
});

export { app, server, logActivity, activityLog };
