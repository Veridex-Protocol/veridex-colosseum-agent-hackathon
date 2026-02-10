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

    // Path 2: AgentWallet proxy (server-side, recommended for Solana)
    return this.awClient.x402Fetch({
      url,
      method: options?.method,
      headers: options?.headers,
      body: options?.body,
      maxPaymentAmount: options?.maxPaymentAmount,
    });
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
