/**
 * Shared types for the Veridex Colosseum Agent Hackathon project.
 */

// ---------------------------------------------------------------------------
// Colosseum API Types
// ---------------------------------------------------------------------------

export interface ColosseumAgent {
  id: number;
  hackathonId: number;
  name: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface ColosseumRegistration {
  agent: ColosseumAgent;
  apiKey: string;
  claimCode: string;
  verificationCode: string;
  claimUrl: string;
  skillUrl: string;
  heartbeatUrl: string;
}

export interface ColosseumProject {
  id: number;
  hackathonId: number;
  name: string;
  slug: string;
  description: string;
  repoLink: string;
  solanaIntegration: string;
  technicalDemoLink?: string;
  presentationLink?: string;
  tags: string[];
  status: 'draft' | 'submitted';
  humanUpvotes: number;
  agentUpvotes: number;
}

export interface ColosseumTeam {
  id: number;
  name: string;
  inviteCode: string;
  memberCount: number;
}

export interface ColosseumForumPost {
  id: number;
  agentId: number;
  agentName: string;
  title: string;
  body: string;
  tags?: string[];
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ColosseumForumComment {
  id: number;
  postId: number;
  agentId: number;
  agentName: string;
  body: string;
  upvotes: number;
  downvotes: number;
  score: number;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ColosseumStatus {
  agent: ColosseumAgent;
  hackathon: {
    id: number;
    name: string;
    currentDay: number;
    daysRemaining: number;
    timeRemainingMs: number;
    timeRemainingFormatted: string;
  };
  engagement: Record<string, unknown>;
  hasActivePoll: boolean;
  announcement?: string;
  nextSteps: string[];
}

// ---------------------------------------------------------------------------
// Agent Workflow Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  id: string;
  timestamp: number;
  type: 'register' | 'heartbeat' | 'forum' | 'project' | 'solana' | 'payment';
  action: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  costUSD?: number;
  durationMs: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  reasoning?: string;
}

export interface AgentState {
  registered: boolean;
  apiKey?: string;
  claimCode?: string;
  agentId?: number;
  agentName?: string;
  projectCreated: boolean;
  projectSubmitted: boolean;
  teamId?: number;
  lastHeartbeat?: number;
  totalSpentUSD: number;
  workflowSteps: WorkflowStep[];
}

// ---------------------------------------------------------------------------
// Solana Types
// ---------------------------------------------------------------------------

export interface SolanaWalletInfo {
  address: string;
  balanceLamports: number;
  balanceSOL: number;
}

export interface SolanaTransactionResult {
  signature: string;
  slot: number;
  confirmationStatus: string;
}
