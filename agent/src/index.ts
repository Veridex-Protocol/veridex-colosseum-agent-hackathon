/**
 * Veridex Solana Agent — Main Entry Point
 *
 * Autonomous AI agent for the Colosseum Agent Hackathon.
 * Integrates @veridex/agentic-payments SDK for x402 payment protocol
 * and Solana on-chain operations.
 *
 * Lifecycle:
 *   1. Load config from .env
 *   2. Initialize Colosseum API client
 *   3. Initialize Veridex AgentWallet (session-key-based payments)
 *   4. Run heartbeat loop (sync with hackathon)
 *   5. Execute agent tasks (forum engagement, project management, Solana ops)
 */

import 'dotenv/config';
import { ColosseumClient } from './colosseum-client.js';
import { SolanaAgent } from './solana-agent.js';
import { AgentWalletClient } from './agentwallet-client.js';
import { runHeartbeat } from './heartbeat.js';
import { recordProof, getProofStats } from './proof-of-work.js';
import type { AgentState, WorkflowStep } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const COLOSSEUM_API_KEY = process.env.COLOSSEUM_API_KEY || '';
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '1800000', 10); // 30 min
const MERCHANT_URL = process.env.MERCHANT_URL || 'http://localhost:4000';

// AgentWallet client for proof-of-work signing
let awClient: AgentWalletClient | null = null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state: AgentState = {
  registered: !!COLOSSEUM_API_KEY,
  apiKey: COLOSSEUM_API_KEY || undefined,
  projectCreated: false,
  projectSubmitted: false,
  totalSpentUSD: 0,
  workflowSteps: [],
};

function logStep(step: WorkflowStep) {
  state.workflowSteps.push(step);
  const icon = step.status === 'success' ? '✅' : step.status === 'failed' ? '❌' : '⏭️';
  console.log(`${icon} [${step.type}] ${step.action} (${step.durationMs}ms)`);
  if (step.error) console.log(`   Error: ${step.error}`);
}

// ---------------------------------------------------------------------------
// Agent Tasks
// ---------------------------------------------------------------------------

/**
 * Check agent status and sync with hackathon.
 */
async function checkStatus(client: ColosseumClient): Promise<void> {
  const start = Date.now();
  try {
    const status = await client.getStatus();
    state.agentId = status.agent.id;
    state.agentName = status.agent.name;

    if (status.hackathon) {
      console.log(`\n📅 Day ${status.hackathon.currentDay} — ${status.hackathon.daysRemaining} days left (${status.hackathon.timeRemainingFormatted})`);
    }

    if (status.announcement) {
      console.log(`📢 ${status.announcement}`);
    }

    // Handle active poll
    if (status.hasActivePoll) {
      try {
        const poll = await client.getActivePoll();
        console.log(`📊 Active poll: ${JSON.stringify(poll)}`);
        // Auto-respond to polls if they have simple options
        // (In a real agent, this would use LLM reasoning)
      } catch (err: any) {
        console.warn(`   Poll fetch failed: ${err.message}`);
      }
    }

    logStep({
      id: `status-${Date.now()}`,
      timestamp: start,
      type: 'heartbeat',
      action: 'Checked agent status',
      output: { agentId: status.agent.id, day: status.hackathon?.currentDay },
      durationMs: Date.now() - start,
      status: 'success',
    });
  } catch (err: any) {
    logStep({
      id: `status-${Date.now()}`,
      timestamp: start,
      type: 'heartbeat',
      action: 'Check agent status',
      durationMs: Date.now() - start,
      status: 'failed',
      error: err.message,
    });
  }
}

/**
 * Check if project exists; if not, create a draft.
 */
async function ensureProject(client: ColosseumClient): Promise<void> {
  const start = Date.now();
  try {
    const { project } = await client.getMyProject();
    state.projectCreated = true;
    state.projectSubmitted = project.status === 'submitted';
    console.log(`🏗  Project: "${project.name}" (${project.status})`);

    logStep({
      id: `project-check-${Date.now()}`,
      timestamp: start,
      type: 'project',
      action: `Project exists: ${project.name} (${project.status})`,
      durationMs: Date.now() - start,
      status: 'success',
    });
  } catch {
    // No project yet — create one
    console.log('🏗  No project found. Creating draft...');
    try {
      const { project } = await client.createProject({
        name: 'Veridex Solana Agent',
        description:
          'An autonomous AI agent powered by the Veridex Agent SDK (@veridex/agentic-payments). ' +
          'Demonstrates cross-chain agentic payments using the x402 protocol on Solana. ' +
          'The agent manages its own session-key-based wallet with spending limits, ' +
          'auto-detects payment protocols (x402/UCP/ACP/AP2), and executes on-chain ' +
          'transactions autonomously within human-authorized budgets.',
        repoLink: 'https://github.com/Veridex-Protocol/demo',
        solanaIntegration:
          'Uses @solana/web3.js for Solana devnet interactions. ' +
          'Integrates Veridex Agent SDK for x402 payment protocol — session-key-based ' +
          'autonomous payments with spending limits, multi-protocol detection, and ' +
          'audit logging. Leverages Pyth Network for real-time SOL/USD pricing.',
        tags: ['payments', 'ai', 'infra'],
      });

      state.projectCreated = true;
      console.log(`✅ Project created: "${project.name}" (${project.slug})`);

      logStep({
        id: `project-create-${Date.now()}`,
        timestamp: start,
        type: 'project',
        action: `Created project: ${project.name}`,
        durationMs: Date.now() - start,
        status: 'success',
      });
    } catch (err: any) {
      logStep({
        id: `project-create-${Date.now()}`,
        timestamp: start,
        type: 'project',
        action: 'Create project',
        durationMs: Date.now() - start,
        status: 'failed',
        error: err.message,
      });
    }
  }
}

/**
 * Browse the forum and engage with relevant posts.
 */
async function engageForum(client: ColosseumClient): Promise<void> {
  const start = Date.now();
  try {
    // Search for payment/infra related posts
    const { results } = await client.searchForum('payments agent wallet', {
      sort: 'hot',
      tags: ['payments', 'infra', 'ai'],
      limit: 10,
    });

    console.log(`💬 Found ${results?.length || 0} relevant forum results`);

    // Also check hot posts
    const { posts } = await client.listPosts({ sort: 'hot', limit: 10 });
    console.log(`💬 Top ${posts?.length || 0} hot posts loaded`);

    logStep({
      id: `forum-${Date.now()}`,
      timestamp: start,
      type: 'forum',
      action: `Browsed forum: ${results?.length || 0} search results, ${posts?.length || 0} hot posts`,
      durationMs: Date.now() - start,
      status: 'success',
    });
  } catch (err: any) {
    logStep({
      id: `forum-${Date.now()}`,
      timestamp: start,
      type: 'forum',
      action: 'Browse forum',
      durationMs: Date.now() - start,
      status: 'failed',
      error: err.message,
    });
  }
}

/**
 * Check wallet balances via AgentWallet API and Veridex session status.
 */
async function checkWalletStatus(solanaAgent: SolanaAgent): Promise<void> {
  const start = Date.now();
  try {
    // Check AgentWallet connection + Solana balance
    if (solanaAgent.isReady()) {
      const solAddress = solanaAgent.getSolanaAddress();
      console.log(`\n💰 AgentWallet: ${solAddress || 'connected'}`);

      try {
        const devnetBal = await solanaAgent.getSolanaDevnetBalance();
        const mainnetBal = await solanaAgent.getSolanaBalance();
        console.log(`   Solana devnet: ${devnetBal.toFixed(4)} SOL`);
        console.log(`   Solana mainnet: ${mainnetBal.toFixed(4)} SOL`);
      } catch (balErr: any) {
        console.log(`   Balance check failed: ${balErr.message}`);
      }

      // Check Veridex session if available
      const session = solanaAgent.getSessionStatus();
      if (session) {
        console.log(`   Veridex session: ${session.isValid ? 'active' : 'expired'}`);
        console.log(`   Daily limit remaining: $${session.remainingDailyLimitUSD.toFixed(2)}`);
        state.totalSpentUSD = session.totalSpentUSD;
      } else {
        console.log(`   Veridex SDK: not configured (AgentWallet API active)`);
      }

      console.log(`   Total spent: $${solanaAgent.getTotalSpentUSD().toFixed(2)}`);
    } else {
      console.log('\n💰 Wallet: not configured (set AGENT_WALLET_USERNAME + AGENT_WALLET_API_KEY in .env)');
    }

    logStep({
      id: `wallet-${Date.now()}`,
      timestamp: start,
      type: 'payment',
      action: solanaAgent.isReady() ? `Wallet connected — AgentWallet active` : 'Wallet not configured',
      durationMs: Date.now() - start,
      status: 'success',
    });
  } catch (err: any) {
    logStep({
      id: `wallet-${Date.now()}`,
      timestamp: start,
      type: 'payment',
      action: 'Check wallet status',
      durationMs: Date.now() - start,
      status: 'failed',
      error: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Main Loop
// ---------------------------------------------------------------------------

/**
 * Discover and call x402-protected merchant tools.
 */
async function discoverAndPayTools(solanaAgent: SolanaAgent): Promise<void> {
  const start = Date.now();
  try {
    // Step 1: Discover available tools
    const toolsRes = await fetch(`${MERCHANT_URL}/api/v1/tools`);
    if (!toolsRes.ok) {
      console.log('🔧 Merchant server not running — skipping tool discovery');
      return;
    }
    const { tools } = await toolsRes.json() as any;
    console.log(`\n🔧 Discovered ${tools.length} paid tools:`);
    tools.forEach((t: any) => {
      console.log(`   ${t.method.padEnd(5)} ${t.endpoint.padEnd(25)} $${t.priceUSD}  — ${t.name}`);
    });

    if (awClient) {
      await recordProof(awClient, 'tool_discovery', 'discovery', {
        toolCount: tools.length,
        tools: tools.map((t: any) => t.id),
      });
    }

    // Step 2: Call the SOL price tool via x402
    console.log('\n💳 Calling SOL price feed via x402...');
    const priceResult = await solanaAgent.x402Fetch(`${MERCHANT_URL}/api/v1/market/sol`, {
      method: 'GET',
      headers: { 'X-Agent-Name': 'veridex-solana-agent' },
    });

    if ('success' in priceResult && priceResult.success) {
      const body = priceResult.response?.body;
      console.log(`   SOL Price: $${body?.priceUSD} (${body?.change24hPercent > 0 ? '+' : ''}${body?.change24hPercent}%)`);
      if (priceResult.paid) {
        console.log(`   Paid: ${priceResult.payment?.amountFormatted} via ${priceResult.payment?.chain}`);
      }

      if (awClient) {
        await recordProof(awClient, 'x402_payment_sol_price', 'payment', {
          tool: 'sol-price',
          priceUSD: body?.priceUSD,
          paid: priceResult.paid,
          protocol: 'x402',
        });
      }
    } else {
      // Got a 402 response — this is expected if AgentWallet doesn't have funds
      console.log('   Received 402 Payment Required (expected — demonstrates x402 protocol)');
      if (awClient) {
        await recordProof(awClient, 'x402_402_received', 'payment', {
          tool: 'sol-price',
          status: 402,
          protocol: 'x402',
        });
      }
    }

    // Step 3: Call market analysis tool
    console.log('\n💳 Calling market analysis via x402...');
    const analysisResult = await solanaAgent.x402Fetch(`${MERCHANT_URL}/api/v1/analyze`, {
      method: 'POST',
      headers: { 'X-Agent-Name': 'veridex-solana-agent' },
      body: { token: 'SOL', sector: 'defi' },
    });

    if ('success' in analysisResult && analysisResult.success) {
      const body = analysisResult.response?.body;
      console.log(`   Analysis: ${body?.sentiment} (${(body?.confidence * 100).toFixed(0)}% confidence)`);
      console.log(`   Summary: ${body?.summary?.slice(0, 100)}...`);
    } else {
      console.log('   Received 402 Payment Required (demonstrates x402 protocol)');
    }

    logStep({
      id: `tools-${Date.now()}`,
      timestamp: start,
      type: 'payment',
      action: `Discovered ${tools.length} tools, attempted x402 payments`,
      durationMs: Date.now() - start,
      status: 'success',
    });
  } catch (err: any) {
    logStep({
      id: `tools-${Date.now()}`,
      timestamp: start,
      type: 'payment',
      action: 'Discover and pay tools',
      durationMs: Date.now() - start,
      status: 'failed',
      error: err.message,
    });
  }
}

async function runCycle(client: ColosseumClient, solanaAgent: SolanaAgent): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 Agent cycle @ ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Record cycle start proof
  if (awClient) {
    await recordProof(awClient, 'cycle_start', 'system', {
      cycle: state.workflowSteps.length,
      timestamp: Date.now(),
    });
  }

  await checkStatus(client);
  await ensureProject(client);
  await engageForum(client);
  await discoverAndPayTools(solanaAgent);
  await checkWalletStatus(solanaAgent);

  // Log proof stats
  const proofStats = getProofStats();
  console.log(`\n⛓️  Proof stats: ${proofStats.total} total, ${proofStats.signed} signed`);

  state.lastHeartbeat = Date.now();
  console.log(`\n✅ Cycle complete. Next heartbeat in ${HEARTBEAT_INTERVAL_MS / 1000}s`);
}

async function main() {
  console.log('🚀 Veridex Solana Agent — Colosseum Agent Hackathon\n');
  console.log('   Powered by @veridex/agentic-payments SDK');
  console.log('   x402 | UCP | ACP | AP2 multi-protocol support\n');

  // Validate API key
  if (!COLOSSEUM_API_KEY) {
    console.error('❌ COLOSSEUM_API_KEY not set.');
    console.error('   Run `npm run register` to register your agent first.');
    console.error('   Then add the API key to your .env file.');
    process.exit(1);
  }

  // Initialize AgentWallet client for proof-of-work
  const awUsername = process.env.AGENT_WALLET_USERNAME || '';
  const awToken = process.env.AGENT_WALLET_API_KEY || '';
  if (awUsername && awToken) {
    awClient = new AgentWalletClient({ username: awUsername, apiToken: awToken });
    console.log(`🔗 AgentWallet: ${awUsername} (proof-of-work signing enabled)`);
  }

  // Initialize clients
  const client = new ColosseumClient(COLOSSEUM_API_KEY);
  const solanaAgent = new SolanaAgent({
    // AgentWallet (required for Solana ops)
    agentWalletUsername: process.env.AGENT_WALLET_USERNAME || '',
    agentWalletToken: process.env.AGENT_WALLET_API_KEY || '',
    // Veridex SDK (optional — for multi-protocol detection)
    credentialId: process.env.VERIDEX_CREDENTIAL_ID || undefined,
    publicKeyX: process.env.VERIDEX_PUBLIC_KEY_X || undefined,
    publicKeyY: process.env.VERIDEX_PUBLIC_KEY_Y || undefined,
    keyHash: process.env.VERIDEX_KEY_HASH || undefined,
    // Spending limits
    dailyLimitUSD: parseFloat(process.env.AGENT_DAILY_LIMIT || '50'),
    perTransactionLimitUSD: parseFloat(process.env.AGENT_PER_TX_LIMIT || '5'),
    relayerUrl: process.env.VERIDEX_RELAYER_URL,
    relayerApiKey: process.env.VERIDEX_RELAYER_KEY,
  });

  // Set up spending alerts
  solanaAgent.onSpendingAlert((alert) => {
    console.log(`⚠️  Spending alert: ${alert.message} ($${alert.dailySpentUSD}/$${alert.dailyLimitUSD})`);
  });

  // Run initial cycle
  await runCycle(client, solanaAgent);

  // Run heartbeat on interval
  console.log(`\n🫀 Heartbeat loop started (interval: ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
  setInterval(async () => {
    try {
      // Run the full heartbeat check
      await runHeartbeat(COLOSSEUM_API_KEY);
      // Then run agent cycle
      await runCycle(client, solanaAgent);
    } catch (err: any) {
      console.error(`❌ Heartbeat cycle error: ${err.message}`);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
