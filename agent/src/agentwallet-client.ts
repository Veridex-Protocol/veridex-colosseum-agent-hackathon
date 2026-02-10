/**
 * AgentWallet API Client
 *
 * Typed wrapper around the AgentWallet REST API (https://agentwallet.mcpay.tech).
 * Handles Solana wallet operations, x402 payment signing, balance queries,
 * and devnet faucet requests.
 *
 * This is the required wallet infrastructure for the Colosseum Agent Hackathon.
 * Do NOT manage raw Solana keys — use this client instead.
 */

const API_BASE = 'https://agentwallet.mcpay.tech/api';

export interface AgentWalletConfig {
  username: string;
  apiToken: string;
}

export interface WalletBalance {
  chain: string;
  asset: string;
  rawValue: string;
  decimals: number;
  displayValues: Record<string, string>;
}

export interface WalletBalances {
  username: string;
  solanaWallets: Array<{
    address: string;
    walletId: string;
    balances: WalletBalance[];
  }>;
  evmWallets: Array<{
    address: string;
    walletId: string;
    balances: WalletBalance[];
  }>;
}

export interface ActionResult {
  actionId: string;
  status: 'confirmed' | 'pending' | 'failed';
  txHash?: string;
  explorer?: string;
  amount?: string;
  remaining?: number;
}

export interface X402FetchResult {
  success: boolean;
  response: {
    status: number;
    body: any;
    contentType: string;
  };
  payment?: {
    chain: string;
    amountFormatted: string;
    recipient: string;
  };
  paid: boolean;
  attempts: number;
  duration: number;
}

export interface ActivityEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export class AgentWalletClient {
  private username: string;
  private apiToken: string;

  constructor(config: AgentWalletConfig) {
    this.username = config.username;
    this.apiToken = config.apiToken;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private walletUrl(path: string): string {
    return `${API_BASE}/wallets/${this.username}${path}`;
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const opts: RequestInit = {
      method,
      headers: this.headers(!!body),
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();

    if (!res.ok) {
      let errorMsg: string;
      try {
        const err = JSON.parse(text);
        errorMsg = err.error || err.message || text;
      } catch {
        errorMsg = text;
      }
      throw new Error(`AgentWallet ${method} ${url} → ${res.status}: ${errorMsg}`);
    }

    return text ? JSON.parse(text) : ({} as T);
  }

  // ---------------------------------------------------------------------------
  // Connection Check
  // ---------------------------------------------------------------------------

  /**
   * Check if the wallet is connected (public, no auth needed).
   */
  async checkConnection(): Promise<{ connected: boolean; solanaAddress?: string; evmAddress?: string }> {
    const res = await fetch(`${API_BASE}/wallets/${this.username}`);
    const data = await res.json() as any;
    return {
      connected: data.connected || false,
      solanaAddress: data.solanaAddress,
      evmAddress: data.evmAddress,
    };
  }

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  async getBalances(): Promise<WalletBalances> {
    return this.request('GET', this.walletUrl('/balances'));
  }

  /**
   * Get Solana devnet SOL balance as a number.
   */
  async getSolanaDevnetBalance(): Promise<number> {
    const balances = await this.getBalances();
    const solWallet = balances.solanaWallets?.[0];
    if (!solWallet) return 0;
    const devnetSol = solWallet.balances.find(
      (b) => b.chain === 'solana-devnet' && b.asset === 'sol',
    );
    if (!devnetSol) return 0;
    return Number(devnetSol.rawValue) / Math.pow(10, devnetSol.decimals);
  }

  /**
   * Get Solana mainnet SOL balance as a number.
   */
  async getSolanaBalance(): Promise<number> {
    const balances = await this.getBalances();
    const solWallet = balances.solanaWallets?.[0];
    if (!solWallet) return 0;
    const sol = solWallet.balances.find(
      (b) => b.chain === 'solana' && b.asset === 'sol',
    );
    if (!sol) return 0;
    return Number(sol.rawValue) / Math.pow(10, sol.decimals);
  }

  // ---------------------------------------------------------------------------
  // Faucet (Devnet)
  // ---------------------------------------------------------------------------

  /**
   * Request free devnet SOL (0.1 SOL). Rate limited to 3/day.
   */
  async requestDevnetSol(): Promise<ActionResult> {
    return this.request('POST', this.walletUrl('/actions/faucet-sol'), {});
  }

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------

  /**
   * Transfer SOL or USDC on Solana.
   */
  async transferSolana(params: {
    to: string;
    amount: string;
    asset: 'sol' | 'usdc';
    network: 'mainnet' | 'devnet';
    idempotencyKey?: string;
  }): Promise<ActionResult> {
    return this.request('POST', this.walletUrl('/actions/transfer-solana'), params);
  }

  /**
   * Transfer ETH or USDC on EVM chains.
   */
  async transferEvm(params: {
    to: string;
    amount: string;
    asset: 'eth' | 'usdc';
    chainId: number;
    idempotencyKey?: string;
  }): Promise<ActionResult> {
    return this.request('POST', this.walletUrl('/actions/transfer'), params);
  }

  // ---------------------------------------------------------------------------
  // Sign Message
  // ---------------------------------------------------------------------------

  async signMessage(chain: 'solana' | 'evm', message: string): Promise<{ signature: string }> {
    return this.request('POST', this.walletUrl('/actions/sign-message'), {
      chain,
      message,
    });
  }

  // ---------------------------------------------------------------------------
  // x402 Payments (One-Step Proxy)
  // ---------------------------------------------------------------------------

  /**
   * Make an x402 payment request through AgentWallet's proxy.
   * This is the RECOMMENDED way to call x402-protected APIs.
   * The server handles 402 detection, payment signing, and retry automatically.
   */
  async x402Fetch(params: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    maxPaymentAmount?: string;
    dryRun?: boolean;
  }): Promise<X402FetchResult> {
    return this.request('POST', this.walletUrl('/actions/x402/fetch'), {
      url: params.url,
      method: params.method || 'GET',
      headers: {
        ...params.headers,
        'X402_ALLOW_HTTP': 'true',
      },
      body: params.body,
      maxPaymentAmount: params.maxPaymentAmount,
      dryRun: params.dryRun,
      allowHttp: true,
      X402_ALLOW_HTTP: true,
    });
  }

  // ---------------------------------------------------------------------------
  // EVM Contract Call
  // ---------------------------------------------------------------------------

  async contractCall(params: {
    to: string;
    data: string;
    value?: string;
    chainId: number;
  }): Promise<ActionResult> {
    return this.request('POST', this.walletUrl('/actions/contract-call'), params);
  }

  // ---------------------------------------------------------------------------
  // Activity
  // ---------------------------------------------------------------------------

  async getActivity(limit = 50): Promise<ActivityEvent[]> {
    const data = await this.request<any>('GET', this.walletUrl(`/activity?limit=${limit}`));
    return data.events || data.activity || [];
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  async getStats(): Promise<any> {
    return this.request('GET', this.walletUrl('/stats'));
  }

  // ---------------------------------------------------------------------------
  // Network Pulse (public)
  // ---------------------------------------------------------------------------

  static async getNetworkPulse(): Promise<any> {
    const res = await fetch(`${API_BASE}/network/pulse`);
    return res.json();
  }
}
