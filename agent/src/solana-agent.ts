/**
 * Solana Agent
 *
 * Wraps @veridex/agentic-payments SDK for Solana on-chain operations.
 * Provides wallet management, balance queries, and transaction execution
 * using the AgentWallet's session-key-based autonomous payment system.
 */

import {
  createAgentWallet,
  AgentWallet,
  SolanaChainClient,
} from '@veridex/agentic-payments';
import type {
  AgentWalletConfig,
  UniversalFetchOptions,
  CostEstimate,
  PaymentSettlement,
} from '@veridex/agentic-payments';

export interface SolanaAgentConfig {
  // Veridex passkey credentials
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  keyHash: string;

  // Session key (encrypted)
  sessionKey?: string;
  sessionAddress?: string;

  // Spending limits
  dailyLimitUSD: number;
  perTransactionLimitUSD: number;

  // Relayer
  relayerUrl?: string;
  relayerApiKey?: string;

  // Solana RPC
  solanaRpcUrl?: string;
}

export class SolanaAgent {
  private wallet: AgentWallet | null = null;
  private walletReady: Promise<AgentWallet | null>;
  private config: SolanaAgentConfig;

  constructor(config: SolanaAgentConfig) {
    this.config = config;
    this.walletReady = this.initWallet();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  private async initWallet(): Promise<AgentWallet | null> {
    try {
      const walletConfig: AgentWalletConfig = {
        masterCredential: {
          credentialId: this.config.credentialId,
          publicKeyX: BigInt(this.config.publicKeyX || '0'),
          publicKeyY: BigInt(this.config.publicKeyY || '0'),
          keyHash: this.config.keyHash,
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
      this.wallet = wallet;
      console.log('[SolanaAgent] AgentWallet initialized — x402 payments enabled');
      return wallet;
    } catch (err: any) {
      console.warn(`[SolanaAgent] AgentWallet init failed: ${err.message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Wallet Access
  // ---------------------------------------------------------------------------

  async getWallet(): Promise<AgentWallet | null> {
    return this.walletReady;
  }

  isReady(): boolean {
    return this.wallet !== null;
  }

  // ---------------------------------------------------------------------------
  // Session Status
  // ---------------------------------------------------------------------------

  getSessionStatus() {
    if (!this.wallet) return null;
    try {
      return this.wallet.getSessionStatus();
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Universal Fetch (x402 / UCP / ACP / AP2)
  // ---------------------------------------------------------------------------

  /**
   * Make an HTTP request through the AgentWallet's universal fetch.
   * Automatically handles x402 payment negotiation if the endpoint requires it.
   */
  async fetch(url: string, options?: UniversalFetchOptions): Promise<Response> {
    const wallet = await this.walletReady;
    if (!wallet) {
      console.warn('[SolanaAgent] No wallet — using plain fetch');
      return globalThis.fetch(url, options);
    }
    return wallet.fetch(url, options);
  }

  /**
   * Estimate the cost of a request without executing payment.
   */
  async estimateCost(url: string, options?: RequestInit): Promise<CostEstimate | null> {
    const wallet = await this.walletReady;
    if (!wallet) return null;
    return wallet.estimateCost(url, options);
  }

  // ---------------------------------------------------------------------------
  // Balance
  // ---------------------------------------------------------------------------

  async getBalance(chain?: number) {
    const wallet = await this.walletReady;
    if (!wallet) return [];
    return wallet.getBalance(chain);
  }

  async getMultiChainBalance() {
    const wallet = await this.walletReady;
    if (!wallet) return null;
    return wallet.getMultiChainBalance();
  }

  // ---------------------------------------------------------------------------
  // Payment
  // ---------------------------------------------------------------------------

  /**
   * Execute a direct payment via the AgentWallet.
   */
  async pay(params: {
    amount: string;
    token: string;
    recipient: string;
    chain: number;
    protocol?: 'x402' | 'ucp' | 'direct';
  }) {
    const wallet = await this.walletReady;
    if (!wallet) throw new Error('Wallet not initialized');
    return wallet.pay(params);
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  async getPaymentHistory(limit = 50) {
    const wallet = await this.walletReady;
    if (!wallet) return [];
    return wallet.getPaymentHistory({ limit });
  }

  async exportAuditLog(format: 'csv' | 'json' = 'json') {
    const wallet = await this.walletReady;
    if (!wallet) return '[]';
    return wallet.exportAuditLog(format);
  }

  // ---------------------------------------------------------------------------
  // Spending Alerts
  // ---------------------------------------------------------------------------

  onSpendingAlert(callback: (alert: any) => void) {
    if (this.wallet) {
      this.wallet.onSpendingAlert(callback);
    }
  }
}
