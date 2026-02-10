/**
 * Colosseum API Client
 *
 * Typed wrapper around the Colosseum Agent Hackathon REST API.
 * Base URL: https://agents.colosseum.com/api
 */

import type {
  ColosseumRegistration,
  ColosseumProject,
  ColosseumTeam,
  ColosseumStatus,
  ColosseumForumPost,
  ColosseumForumComment,
} from '../../shared/types.js';

const API_BASE = 'https://agents.colosseum.com/api';

export class ColosseumClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    auth = true,
  ): Promise<T> {
    const url = `${API_BASE}${path}`;
    const opts: RequestInit = {
      method,
      headers: auth ? this.headers(!!body) : { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Colosseum API ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Registration (no auth)
  // ---------------------------------------------------------------------------

  static async register(name: string): Promise<ColosseumRegistration> {
    const res = await fetch(`${API_BASE}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Registration failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<ColosseumRegistration>;
  }

  // ---------------------------------------------------------------------------
  // Agent Status
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<ColosseumStatus> {
    return this.request('GET', '/agents/status');
  }

  // ---------------------------------------------------------------------------
  // Polls
  // ---------------------------------------------------------------------------

  async getActivePoll(): Promise<any> {
    return this.request('GET', '/agents/polls/active');
  }

  async respondToPoll(pollId: string, response: Record<string, unknown>): Promise<any> {
    return this.request('POST', `/agents/polls/${pollId}/response`, response);
  }

  // ---------------------------------------------------------------------------
  // Project
  // ---------------------------------------------------------------------------

  async getMyProject(): Promise<{ project: ColosseumProject }> {
    return this.request('GET', '/my-project');
  }

  async createProject(data: {
    name: string;
    description: string;
    repoLink: string;
    solanaIntegration: string;
    technicalDemoLink?: string;
    presentationLink?: string;
    tags?: string[];
  }): Promise<{ project: ColosseumProject }> {
    return this.request('POST', '/my-project', data);
  }

  async updateProject(data: Partial<{
    name: string;
    description: string;
    repoLink: string;
    solanaIntegration: string;
    technicalDemoLink: string;
    presentationLink: string;
    tags: string[];
  }>): Promise<{ project: ColosseumProject }> {
    return this.request('PUT', '/my-project', data);
  }

  async submitProject(): Promise<{ project: ColosseumProject }> {
    return this.request('POST', '/my-project/submit');
  }

  // ---------------------------------------------------------------------------
  // Teams
  // ---------------------------------------------------------------------------

  async createTeam(name: string): Promise<{ team: ColosseumTeam }> {
    return this.request('POST', '/teams', { name });
  }

  async joinTeam(inviteCode: string): Promise<{ team: ColosseumTeam }> {
    return this.request('POST', '/teams/join', { inviteCode });
  }

  async leaveTeam(): Promise<void> {
    await this.request('POST', '/teams/leave');
  }

  async getMyTeam(): Promise<{ team: ColosseumTeam }> {
    return this.request('GET', '/my-team');
  }

  // ---------------------------------------------------------------------------
  // Forum
  // ---------------------------------------------------------------------------

  async createPost(data: {
    title: string;
    body: string;
    tags?: string[];
  }): Promise<{ post: ColosseumForumPost }> {
    return this.request('POST', '/forum/posts', data);
  }

  async editPost(postId: number, data: {
    body?: string;
    tags?: string[];
  }): Promise<{ post: ColosseumForumPost }> {
    return this.request('PATCH', `/forum/posts/${postId}`, data);
  }

  async deletePost(postId: number): Promise<void> {
    await this.request('DELETE', `/forum/posts/${postId}`);
  }

  async getMyPosts(sort = 'new', limit = 20, offset = 0): Promise<{ posts: ColosseumForumPost[] }> {
    return this.request('GET', `/forum/me/posts?sort=${sort}&limit=${limit}&offset=${offset}`);
  }

  async commentOnPost(postId: number, body: string): Promise<{ comment: ColosseumForumComment }> {
    return this.request('POST', `/forum/posts/${postId}/comments`, { body });
  }

  async editComment(commentId: number, body: string): Promise<{ comment: ColosseumForumComment }> {
    return this.request('PATCH', `/forum/comments/${commentId}`, { body });
  }

  async deleteComment(commentId: number): Promise<void> {
    await this.request('DELETE', `/forum/comments/${commentId}`);
  }

  async getMyComments(sort = 'new', limit = 50, offset = 0): Promise<{ comments: ColosseumForumComment[] }> {
    return this.request('GET', `/forum/me/comments?sort=${sort}&limit=${limit}&offset=${offset}`);
  }

  async voteOnPost(postId: number, value: 1 | -1): Promise<void> {
    await this.request('POST', `/forum/posts/${postId}/vote`, { value });
  }

  async removePostVote(postId: number): Promise<void> {
    await this.request('DELETE', `/forum/posts/${postId}/vote`);
  }

  async voteOnComment(commentId: number, value: 1 | -1): Promise<void> {
    await this.request('POST', `/forum/comments/${commentId}/vote`, { value });
  }

  async removeCommentVote(commentId: number): Promise<void> {
    await this.request('DELETE', `/forum/comments/${commentId}/vote`);
  }

  // ---------------------------------------------------------------------------
  // Public Forum (no auth needed but we send it anyway)
  // ---------------------------------------------------------------------------

  async listPosts(opts?: {
    sort?: 'hot' | 'new' | 'top';
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ posts: ColosseumForumPost[] }> {
    const params = new URLSearchParams();
    if (opts?.sort) params.set('sort', opts.sort);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    if (opts?.tags) opts.tags.forEach((t) => params.append('tags', t));
    return this.request('GET', `/forum/posts?${params.toString()}`);
  }

  async getPost(postId: number): Promise<{ post: ColosseumForumPost }> {
    return this.request('GET', `/forum/posts/${postId}`);
  }

  async getPostComments(postId: number, sort = 'hot', limit = 50): Promise<{ comments: ColosseumForumComment[] }> {
    return this.request('GET', `/forum/posts/${postId}/comments?sort=${sort}&limit=${limit}`);
  }

  async searchForum(q: string, opts?: {
    sort?: 'hot' | 'new' | 'top';
    tags?: string[];
    limit?: number;
  }): Promise<{ results: Array<(ColosseumForumPost | ColosseumForumComment) & { type: 'post' | 'comment'; postId: number }> }> {
    const params = new URLSearchParams({ q });
    if (opts?.sort) params.set('sort', opts.sort);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.tags) opts.tags.forEach((t) => params.append('tags', t));
    return this.request('GET', `/forum/search?${params.toString()}`);
  }

  // ---------------------------------------------------------------------------
  // Voting on projects
  // ---------------------------------------------------------------------------

  async voteOnProject(projectId: number): Promise<void> {
    await this.request('POST', `/projects/${projectId}/vote`);
  }

  async removeProjectVote(projectId: number): Promise<void> {
    await this.request('DELETE', `/projects/${projectId}/vote`);
  }

  // ---------------------------------------------------------------------------
  // Public endpoints
  // ---------------------------------------------------------------------------

  async getLeaderboard(): Promise<any> {
    return this.request('GET', '/leaderboard', undefined, false);
  }

  async listProjects(includeDrafts = false): Promise<{ projects: ColosseumProject[] }> {
    const qs = includeDrafts ? '?includeDrafts=true' : '';
    return this.request('GET', `/projects${qs}`, undefined, false);
  }

  async getProjectBySlug(slug: string): Promise<{ project: ColosseumProject }> {
    return this.request('GET', `/projects/${slug}`, undefined, false);
  }

  // ---------------------------------------------------------------------------
  // ClawKey
  // ---------------------------------------------------------------------------

  async verifyClawKey(deviceId: string): Promise<{
    success: boolean;
    message: string;
    clawCreditCode?: string;
    nextStepUrl?: string;
  }> {
    return this.request('POST', '/clawkey/verify', { deviceId });
  }

  async getClawKeyStatus(): Promise<any> {
    return this.request('GET', '/clawkey/status');
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  static async health(): Promise<any> {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  }
}
