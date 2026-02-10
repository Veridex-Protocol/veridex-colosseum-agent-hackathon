/**
 * Heartbeat Handler
 *
 * Periodically syncs with the Colosseum hackathon:
 * - Fetches heartbeat.md for version checks and action items
 * - Checks agent status for announcements, polls, and next steps
 * - Logs engagement metrics
 *
 * Can be run standalone (`npm run heartbeat`) or imported and called on a timer.
 */

import 'dotenv/config';
import { ColosseumClient } from './colosseum-client.js';

const HEARTBEAT_URL = 'https://colosseum.com/heartbeat.md';
const SKILL_URL = 'https://colosseum.com/skill.md';

export interface HeartbeatResult {
  timestamp: number;
  skillVersion: string | null;
  heartbeatContent: string;
  status: any;
  announcement: string | null;
  hasActivePoll: boolean;
  nextSteps: string[];
  actions: string[];
}

/**
 * Fetch the heartbeat markdown and extract action items.
 */
async function fetchHeartbeat(): Promise<string> {
  const res = await fetch(HEARTBEAT_URL);
  if (!res.ok) throw new Error(`Failed to fetch heartbeat: ${res.status}`);
  return res.text();
}

/**
 * Extract the skill version from the skill.md frontmatter.
 */
async function getSkillVersion(): Promise<string | null> {
  try {
    const res = await fetch(SKILL_URL);
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/version:\s*(\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Run a single heartbeat cycle.
 */
export async function runHeartbeat(apiKey: string): Promise<HeartbeatResult> {
  const client = new ColosseumClient(apiKey);
  const actions: string[] = [];

  // 1. Fetch heartbeat content
  const heartbeatContent = await fetchHeartbeat();
  console.log('[Heartbeat] Fetched heartbeat.md');

  // 2. Check skill version
  const skillVersion = await getSkillVersion();
  if (skillVersion) {
    console.log(`[Heartbeat] Skill version: ${skillVersion}`);
  }

  // 3. Get agent status
  let status: any = null;
  let announcement: string | null = null;
  let hasActivePoll = false;
  let nextSteps: string[] = [];

  try {
    status = await client.getStatus();
    announcement = status.announcement || null;
    hasActivePoll = status.hasActivePoll || false;
    nextSteps = status.nextSteps || [];

    if (announcement) {
      console.log(`[Heartbeat] 📢 Announcement: ${announcement}`);
      actions.push(`Read announcement: ${announcement}`);
    }

    if (hasActivePoll) {
      console.log('[Heartbeat] 📊 Active poll available — fetch and respond');
      actions.push('Respond to active poll');
    }

    if (nextSteps.length > 0) {
      console.log(`[Heartbeat] Next steps: ${nextSteps.join(', ')}`);
      actions.push(...nextSteps);
    }

    if (status.hackathon) {
      const h = status.hackathon;
      console.log(`[Heartbeat] Day ${h.currentDay} — ${h.daysRemaining} days remaining (${h.timeRemainingFormatted})`);
    }
  } catch (err: any) {
    console.warn(`[Heartbeat] Status check failed: ${err.message}`);
  }

  return {
    timestamp: Date.now(),
    skillVersion,
    heartbeatContent,
    status,
    announcement,
    hasActivePoll,
    nextSteps,
    actions,
  };
}

// ---------------------------------------------------------------------------
// Standalone execution
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.COLOSSEUM_API_KEY;
  if (!apiKey) {
    console.error('❌ COLOSSEUM_API_KEY not set. Run `npm run register` first.');
    process.exit(1);
  }

  console.log('🫀 Running heartbeat...\n');
  const result = await runHeartbeat(apiKey);

  console.log('\n--- Heartbeat Summary ---');
  console.log(`Skill version: ${result.skillVersion || 'unknown'}`);
  console.log(`Announcement: ${result.announcement || 'none'}`);
  console.log(`Active poll: ${result.hasActivePoll}`);
  console.log(`Actions: ${result.actions.length > 0 ? result.actions.join('\n  - ') : 'none'}`);
}

main().catch(console.error);
