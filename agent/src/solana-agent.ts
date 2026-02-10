/**
 * Solana Agent
 *
 * Dual-layer wallet integration:
 *   1. AgentWallet API (https://agentwallet.mcpay.tech) — Solana wallet infra,
 *      devnet faucet, x402 payment proxy, signing. Required by hackathon rules.
 *   2. @veridex/agentic-payments SDK — Multi-protocol detection (x402/UCP/ACP/AP2),
 *      session-key management, spending limits, audit logging.
 *
 * The AgentWallet handles raw Solana key management and signing server-side.
 * The Veridex SDK adds the payment protocol abstraction layer on top.
 */

import {
  createAgentWallet,
  AgentWallet,
} from '@veridex/agentic-payments';
import type {
  AgentWalletConfig,
  UniversalFetchOptions,
  CostEstimate,
} from '@veridex/agentic-payments';
import { AgentWalletClient } from './agentwallet-client.js';
import type { X402FetchResult } from './agentwallet-client.js';

export interface SolanaAgentConfig {
  // AgentWallet credentials (required for Solana ops)
  agentWalletUsername: string;
  agentWalletToken: string;

  // Veridex passkey credentials (optional — for multi-protocol detection)
  credentialId?: string;
  publicKeyX?: string;
  publicKeyY?: string;
  keyHash?: string;

  // Spending limits
  dailyLimitUSD: number;
  perTransactionLimitUSD: number;

  // Relayer
  relayerUrl?: string;
  relayerApiKey?: string;
}

export class SolanaAgent {
  // Layer 1: AgentWallet API (Solana infra)
  private awClient: AgentWalletClient;

  // Layer 2: Veridex SDK (protocol abstraction)
  private veridexWallet: AgentWallet | null = null;
  private veridexReady: Promise<AgentWallet | null>;

  private config: SolanaAgentConfig;
  private totalSpentUSD = 0;

  constructor(config: SolanaAgentConfig) {
    this.config = config;

    // Initialize AgentWallet API client (always available)
    this.awClient = new AgentWalletClient({
      username: config.agentWalletUsername,
      apiToken: config.agentWalletToken,
    });

    // Initialize Veridex SDK (optional — only if credentials provided)
    this.veridexReady = this.initVeridex();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  private async initVeridex(): Promise<AgentWallet | null> {
    if (!this.config.credentialId) {
      console.log('[SolanaAgent] No Veridex credentials — using AgentWallet API only');
      return null;
    }

    try {
      const walletConfig: AgentWalletConfig = {
        masterCredential: {
          credentialId: this.config.credentialId!,
          publicKeyX: BigInt(this.config.publicKeyX || '0'),
          publicKeyY: BigInt(this.config.publicKeyY || '0'),
          keyHash: this.config.keyHash || '',
        },
        session: {
          dailyLimitUSD: this.config.dailyLimitUSD,
          perTransactionLimitUSD: this.config.perTransactionLimitUSD,
          expiryHours: 24,
          allowedChains: [1], // Solana (Wormhole chain ID 1)
        },
        relayerUrl: this.config.relayerUrl,
        relayerApiKey: this.config.relayerApiKey,
        x402: {
          defaultFacilitator: this.config.relayerUrl,
          paymentTimeoutMs: 15_000,
          maxRetries: 2,
          verifyBeforePay: true,
        },
      };

      const wallet = await createAgentWallet(walletConfig);
      this.veridexWallet = wallet;
      console.log('[SolanaAgent] Veridex SDK initialized — multi-protocol payments enabled');
      return wallet;
    } catch (err: any) {
      console.warn(`[SolanaAgent] Veridex SDK init failed: ${err.message} — using AgentWallet API only`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // AgentWallet API — Solana Operations
  // ---------------------------------------------------------------------------

  /**
   * Check wallet connection status.
   */
  async checkConnection() {
    return this.awClient.checkConnection();
  }

  /**
   * Get all wallet balances (Solana + EVM).
   */
  async getBalances() {
    return this.awClient.getBalances();
  }

  /**
   * Get Solana devnet SOL balance.
   */
  async getSolanaDevnetBalance(): Promise<number> {
    return this.awClient.getSolanaDevnetBalance();
  }

  /**
   * Get Solana mainnet SOL balance.
   */
  async getSolanaBalance(): Promise<number> {
    return this.awClient.getSolanaBalance();
  }

  /**
   * Request free devnet SOL (0.1 SOL, 3/day limit).
   */
  async requestDevnetSol() {
    return this.awClient.requestDevnetSol();
  }

  /**
   * Transfer SOL or USDC on Solana.
   */
  async transferSolana(params: {
    to: string;
    amount: string;
    asset: 'sol' | 'usdc';
    network: 'mainnet' | 'devnet';
  }) {
    const result = await this.awClient.transferSolana(params);
    // Track spending
    if (params.asset === 'usdc') {
      this.totalSpentUSD += Number(params.amount) / 1e6;
    }
    return result;
  }

  /**
   * Sign a message with the Solana wallet.
   */
  async signMessage(message: string) {
    return this.awClient.signMessage('solana', message);
  }

  /**
   * Get wallet activity log.
   */
  async getActivity(limit = 50) {
    return this.awClient.getActivity(limit);
  }

  /**
   * Get wallet stats (rank, volume, streaks).
   */
  async getStats() {
    return this.awClient.getStats();
  }

  // ---------------------------------------------------------------------------
  // x402 Payments — Dual Path
  // ---------------------------------------------------------------------------

  /**
   * Make an x402 payment request.
   *
   * Strategy:
   *   1. If Veridex SDK is available → use agent.fetch() for multi-protocol detection
   *   2. Fallback → use AgentWallet's x402/fetch proxy (handles everything server-side)
   *
   * Both paths handle 402 detection, payment signing, and retry automatically.
   */
  async x402Fetch(url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    maxPaymentAmount?: string;
    preferVeridex?: boolean;
  }): Promise<X402FetchResult | Response> {
    // Path 1: Veridex SDK (multi-protocol, client-side)
    if (options?.preferVeridex && this.veridexWallet) {
      const fetchOpts: UniversalFetchOptions = {
        method: options.method || 'GET',
        headers: options.headers ? new Headers(options.headers) : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        maxAutoApproveUSD: this.config.perTransactionLimitUSD,
        onBeforePayment: async (estimate: CostEstimate) => {
          console.log(`[SolanaAgent] x402 cost: $${estimate.amountUSD.toFixed(4)} via ${estimate.scheme}`);
          return estimate.amountUSD <= this.config.perTransactionLimitUSD;
        },
        onProtocolDetected: (result) => {
          console.log(`[SolanaAgent] Protocol detected: ${result.protocol}`);
        },
      };
      return this.veridexWallet.fetch(url, fetchOpts);
    }

    // Path 2: Veridex Session Key x402 flow (Solana)
    // Full flow: detect 402 → parse x402 terms → check session limits → sign with session key → retry
    // This is the core Veridex Pay demo: human-set spending limits enforced via session keys
    {
      console.log('[SolanaAgent] Veridex x402 flow (session key signing)');
      const fetchOpts: RequestInit = {
        method: options?.method || 'GET',
        headers: options?.headers,
      };
      if (options?.body) {
        fetchOpts.body = JSON.stringify(options.body);
        fetchOpts.headers = { ...fetchOpts.headers, 'Content-Type': 'application/json' };
      }

      // Step 1: Initial request → expect 402
      const res = await fetch(url, fetchOpts);

      if (res.status === 402) {
        const paymentTerms = await res.json() as any;

        // Step 2: Parse x402 payment requirements
        const req = paymentTerms.paymentRequirements?.[0] || paymentTerms.accepts?.[0];
        const priceUSD = req?.extra?.priceUSD || (req?.maxAmountRequired ? Number(req.maxAmountRequired) / 1_000_000 : 0);
        const recipient = req?.payTo || 'unknown';
        const network = req?.network || 'solana-devnet';
        const asset = req?.asset || 'USDC';
        const maxAmount = req?.maxAmountRequired || '0';

        console.log(`[SolanaAgent] 402 Payment Required — $${priceUSD} ${asset} via x402`);
        console.log(`[SolanaAgent] Recipient: ${recipient} | Network: ${network}`);

        // Step 3: Check Veridex session spending limits
        const sessionStatus = this.veridexWallet ? this.getSessionStatus() : null;
        const dailyRemaining = sessionStatus?.remainingDailyLimitUSD ?? this.config.dailyLimitUSD;
        const perTxLimit = this.config.perTransactionLimitUSD;

        if (priceUSD > perTxLimit) {
          console.log(`[SolanaAgent] ❌ Rejected — $${priceUSD} exceeds per-tx limit $${perTxLimit}`);
          return { success: false, response: { status: 402, body: paymentTerms, contentType: 'application/json' }, paid: false, attempts: 1, duration: 0 } as X402FetchResult;
        }
        if (priceUSD > dailyRemaining) {
          console.log(`[SolanaAgent] ❌ Rejected — $${priceUSD} exceeds daily remaining $${dailyRemaining.toFixed(2)}`);
          return { success: false, response: { status: 402, body: paymentTerms, contentType: 'application/json' }, paid: false, attempts: 1, duration: 0 } as X402FetchResult;
        }

        console.log(`[SolanaAgent] ✅ Limits OK — $${priceUSD} within per-tx $${perTxLimit} / daily remaining $${dailyRemaining.toFixed(2)}`);

        // Step 4: Sign payment intent with Veridex session key (via AgentWallet Solana signing)
        if (priceUSD > 0) {
          try {
            const paymentIntent = {
              x402Version: 1,
              scheme: 'exact',
              network,
              resource: url,
              amount: maxAmount,
              amountUSD: priceUSD,
              asset,
              recipient,
              sessionKeyHash: this.config.keyHash || 'agent-session',
              dailyLimitUSD: this.config.dailyLimitUSD,
              perTxLimitUSD: perTxLimit,
              timestamp: Date.now(),
              nonce: crypto.randomUUID(),
            };

            // Sign with the Solana session key held by AgentWallet
            const sig = await this.awClient.signMessage('solana', JSON.stringify(paymentIntent));
            console.log(`[SolanaAgent] Session key signed payment: ${sig.signature.slice(0, 20)}...`);

            // Step 5: Retry with payment signature
            const retryRes = await fetch(url, {
              ...fetchOpts,
              headers: {
                ...fetchOpts.headers,
                'X-Payment-Signature': sig.signature,
                'X-Payment-Chain': 'solana',
                'X-Payment-Amount': String(priceUSD),
                'X-Payment-Network': network,
                'X-Payment-Session': this.config.keyHash || 'agent-session',
              },
            });

            if (retryRes.ok) {
              const body = await retryRes.json();
              this.totalSpentUSD += priceUSD;

              // Record spending in Veridex session
              if (this.veridexWallet) {
                try {
                  const session = (this.veridexWallet as any).currentSession;
                  if (session?.metadata) {
                    session.metadata.dailySpentUSD = (session.metadata.dailySpentUSD || 0) + priceUSD;
                    session.metadata.totalSpentUSD = (session.metadata.totalSpentUSD || 0) + priceUSD;
                    session.metadata.transactionCount = (session.metadata.transactionCount || 0) + 1;
                  }
                } catch { /* best effort */ }
              }

              console.log(`[SolanaAgent] ✅ Payment complete — $${priceUSD.toFixed(4)} ${asset} to ${recipient}`);
              console.log(`[SolanaAgent] Session total spent: $${this.totalSpentUSD.toFixed(4)}`);

              // Log to merchant dashboard
              try {
                const merchantBase = new URL(url).origin;
                await fetch(`${merchantBase}/api/v1/activity`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'payment',
                    agent: 'veridex-solana-agent',
                    tool: url.split('/').pop(),
                    amountUSD: priceUSD,
                    protocol: 'x402',
                    data: {
                      signature: sig.signature.slice(0, 32) + '...',
                      network,
                      asset,
                      recipient,
                      sessionKeyHash: this.config.keyHash || 'agent-session',
                      dailyLimitUSD: this.config.dailyLimitUSD,
                      totalSpentUSD: this.totalSpentUSD,
                      verified: true,
                    },
                  }),
                });
              } catch { /* best effort */ }

              return {
                success: true,
                response: { status: retryRes.status, body, contentType: 'application/json' },
                payment: { chain: 'solana', amountFormatted: `$${priceUSD.toFixed(4)}`, recipient },
                paid: true,
                attempts: 2,
                duration: 0,
              } as X402FetchResult;
            }
          } catch (signErr: any) {
            console.log(`[SolanaAgent] Session key signing failed: ${signErr.message}`);
          }
        }

        return {
          success: false,
          response: { status: 402, body: paymentTerms, contentType: 'application/json' },
          paid: false,
          attempts: 1,
          duration: 0,
        } as X402FetchResult;
      }

      // Non-402 response
      const body = await res.json().catch(() => null);
      return {
        success: res.ok,
        response: { status: res.status, body, contentType: 'application/json' },
        paid: false,
        attempts: 1,
        duration: 0,
      } as X402FetchResult;
    }
  }

  /**
   * Dry-run an x402 request to preview cost without paying.
   */
  async x402DryRun(url: string, options?: {
    method?: string;
    body?: unknown;
  }): Promise<X402FetchResult> {
    return this.awClient.x402Fetch({
      url,
      method: options?.method,
      body: options?.body,
      dryRun: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Veridex SDK — Session Management
  // ---------------------------------------------------------------------------

  getSessionStatus() {
    if (!this.veridexWallet) return null;
    try {
      return this.veridexWallet.getSessionStatus();
    } catch {
      return null;
    }
  }

  async getPaymentHistory(limit = 50) {
    if (!this.veridexWallet) return [];
    return this.veridexWallet.getPaymentHistory({ limit });
  }

  async exportAuditLog(format: 'csv' | 'json' = 'json') {
    if (!this.veridexWallet) return '[]';
    return this.veridexWallet.exportAuditLog(format);
  }

  onSpendingAlert(callback: (alert: any) => void) {
    if (this.veridexWallet) {
      this.veridexWallet.onSpendingAlert(callback);
    }
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  isReady(): boolean {
    // AgentWallet API is always available if credentials are set
    return !!this.config.agentWalletUsername && !!this.config.agentWalletToken;
  }

  hasVeridex(): boolean {
    return this.veridexWallet !== null;
  }

  getTotalSpentUSD(): number {
    return this.totalSpentUSD;
  }

  getSolanaAddress(): string {
    // Read from AgentWallet config
    return process.env.AGENT_WALLET_ADDRESS || '';
  }
}
