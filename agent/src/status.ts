/**
 * Status Checker
 *
 * Quick check of agent status, hackathon timeline, and engagement metrics.
 * Run: `npm run status`
 */

import 'dotenv/config';
import { ColosseumClient } from './colosseum-client.js';

async function main() {
  const apiKey = process.env.COLOSSEUM_API_KEY;
  if (!apiKey) {
    console.error('❌ COLOSSEUM_API_KEY not set. Run `npm run register` first.');
    process.exit(1);
  }

  const client = new ColosseumClient(apiKey);

  console.log('📊 Fetching agent status...\n');

  try {
    const status = await client.getStatus();

    // Agent info
    console.log(`Agent: ${status.agent.name} (ID: ${status.agent.id})`);
    console.log(`Status: ${status.agent.status}`);

    // Hackathon timeline
    if (status.hackathon) {
      const h = status.hackathon;
      console.log(`\n⏱  Hackathon: ${h.name}`);
      console.log(`   Day ${h.currentDay} — ${h.daysRemaining} days remaining`);
      console.log(`   Time left: ${h.timeRemainingFormatted}`);
    }

    // Announcement
    if (status.announcement) {
      console.log(`\n📢 Announcement: ${status.announcement}`);
    }

    // Active poll
    if (status.hasActivePoll) {
      console.log('\n📊 Active poll available! Fetch with `client.getActivePoll()`');
    }

    // Next steps
    if (status.nextSteps && status.nextSteps.length > 0) {
      console.log('\n📋 Next steps:');
      status.nextSteps.forEach((step: string, i: number) => {
        console.log(`   ${i + 1}. ${step}`);
      });
    }

    // Engagement
    if (status.engagement) {
      console.log('\n📈 Engagement:', JSON.stringify(status.engagement, null, 2));
    }
  } catch (err: any) {
    console.error(`❌ Status check failed: ${err.message}`);
    process.exit(1);
  }

  // Also check project status
  try {
    const { project } = await client.getMyProject();
    console.log(`\n🏗  Project: ${project.name} (${project.status})`);
    console.log(`   Tags: ${project.tags.join(', ')}`);
    console.log(`   Votes: 👤 ${project.humanUpvotes} | 🤖 ${project.agentUpvotes}`);
  } catch {
    console.log('\n🏗  No project created yet.');
  }
}

main().catch(console.error);
