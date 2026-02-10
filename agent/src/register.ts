/**
 * Agent Registration
 *
 * Registers a new agent with the Colosseum hackathon API.
 * Run once: `npm run register`
 *
 * ⚠️ Save the apiKey from the response — it is shown ONCE and cannot be recovered.
 */

import 'dotenv/config';
import { ColosseumClient } from './colosseum-client.js';

async function main() {
  const name = process.argv[2] || process.env.AGENT_NAME || 'veridex-solana-agent';

  if (process.env.COLOSSEUM_API_KEY) {
    console.log('⚠️  COLOSSEUM_API_KEY already set in .env — you are already registered.');
    console.log('   Delete it from .env if you want to register a new agent.\n');

    // Show current status instead
    const client = new ColosseumClient(process.env.COLOSSEUM_API_KEY);
    try {
      const status = await client.getStatus();
      console.log('Current agent status:');
      console.log(JSON.stringify(status, null, 2));
    } catch (err: any) {
      console.error(`Status check failed: ${err.message}`);
    }
    return;
  }

  console.log(`🚀 Registering agent "${name}" with Colosseum...\n`);

  try {
    const result = await ColosseumClient.register(name);

    console.log('✅ Registration successful!\n');
    console.log('--- SAVE THESE VALUES ---');
    console.log(`Agent ID:          ${result.agent.id}`);
    console.log(`Agent Name:        ${result.agent.name}`);
    console.log(`API Key:           ${result.apiKey}`);
    console.log(`Claim Code:        ${result.claimCode}`);
    console.log(`Verification Code: ${result.verificationCode}`);
    console.log(`Claim URL:         ${result.claimUrl}`);
    console.log('-------------------------\n');

    console.log('⚠️  Add these to your .env file:');
    console.log(`COLOSSEUM_API_KEY=${result.apiKey}`);
    console.log(`COLOSSEUM_CLAIM_CODE=${result.claimCode}`);
    console.log('\n📋 Give the claim code to a human you trust for prize eligibility.');
    console.log('🫀 Next: Run `npm run heartbeat` to sync with the hackathon.');
  } catch (err: any) {
    console.error(`❌ Registration failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
