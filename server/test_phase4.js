const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { Queue } = require('bullmq');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const { redisOptions } = require('./config/redis');
const User = require('./models/User');
const Webhook = require('./models/Webhook');
const Event = require('./models/Event');
const Delivery = require('./models/Delivery');

const { generateSignature, verifySignature } = require('./utils/webhookSignature');
const { QUEUE_NAME } = require('./queues/webhookQueue');
const { processDeliveryJob } = require('./workers/webhookWorker');

const API_BASE = 'http://localhost:5000/api';

async function runPhase4Tests() {
  console.log('========================================================================');
  console.log('       HOOKFLOW PHASE 4 — COMPREHENSIVE INTEGRATION & SECURITY SUITE    ');
  console.log('========================================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, title, details = '') {
    totalCount++;
    if (condition) {
      passedCount++;
      console.log(`  ✓ TEST ${totalCount}: ${title}`);
      if (details) console.log(`     └─► ${details}`);
    } else {
      console.error(`  ✗ TEST ${totalCount} FAILED: ${title}`);
      if (details) console.error(`     └─► ${details}`);
      throw new Error(`Assertion failed for: ${title}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // STEP 1: HMAC UTILITY UNIT TESTS
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: HMAC-SHA256 SIGNATURE & TIMING-SAFE VERIFICATION ---');

    const testPayload = { eventId: 'evt_123', type: 'order.created', data: { amount: 100 } };
    const payloadStr = JSON.stringify(testPayload);
    const testSecret = 'super_secret_hmac_key_123!';

    const sig1 = generateSignature(payloadStr, testSecret);
    const sig2 = generateSignature(payloadStr, testSecret);

    assert(sig1 === sig2, 'HMAC Signature Generation is Deterministic', `Sig: ${sig1.substring(0, 16)}...`);

    const isValid = verifySignature(payloadStr, sig1, testSecret);
    assert(isValid === true, 'Timing-Safe Verification Succeeds for Valid Signature');

    const isTamperedPayloadValid = verifySignature(JSON.stringify({ ...testPayload, amount: 999 }), sig1, testSecret);
    assert(isTamperedPayloadValid === false, 'Verification FAILS when Payload is Tampered');

    const isWrongSecretValid = verifySignature(payloadStr, sig1, 'wrong_secret_key');
    assert(isWrongSecretValid === false, 'Verification FAILS when Secret is Incorrect');

    const isTamperedSigValid = verifySignature(payloadStr, sig1.replace('a', 'b'), testSecret);
    assert(isTamperedSigValid === false, 'Verification FAILS when Signature Hex is Tampered');

    // -------------------------------------------------------------------------
    // STEP 2: DATABASE CONNECTION & CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: ENVIRONMENT & PERSISTENT DATABASE SETUP ---');
    await connectDB();
    assert(mongoose.connection.readyState === 1, 'MongoDB Database Connection Active');

    // Cleanup previous test records
    await User.deleteMany({ email: { $in: ['phase4_userA@example.com', 'phase4_userB@example.com'] } });
    await Webhook.deleteMany({ secret: { $in: ['sec-phase4-userA', 'sec-phase4-userB', 'sec-verify-123'] } });
    console.log('  └─► Database cleaned up from past test iterations.');

    // -------------------------------------------------------------------------
    // STEP 3: USER REGISTRATION & AUTHENTICATION (PHASE 1 REGRESSION)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: USER AUTHENTICATION & TOKEN ACQUISITION (PHASE 1) ---');

    const regResA = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'User A', email: 'phase4_userA@example.com', password: 'Password123!' }),
    });
    const regDataA = await regResA.json();
    assert(regResA.status === 201 && regDataA.token, 'User A Registered & JWT Token Issued');
    const tokenA = regDataA.token;

    const regResB = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'User B', email: 'phase4_userB@example.com', password: 'Password123!' }),
    });
    const regDataB = await regResB.json();
    assert(regResB.status === 201 && regDataB.token, 'User B Registered & JWT Token Issued');
    const tokenB = regDataB.token;

    // -------------------------------------------------------------------------
    // STEP 4: SECRET ISOLATION & WEBHOOK REGISTRATION (PHASE 2 REGRESSION)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: WEBHOOK REGISTRATION & SECRET ISOLATION ---');

    const hookResA = await fetch(`${API_BASE}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        url: 'http://localhost:5000/api/test/webhook/verify?secret=sec-phase4-userA',
        secret: 'sec-phase4-userA',
      }),
    });
    const hookDataA = await hookResA.json();
    assert(hookResA.status === 201, 'User A Webhook Registered Successfully');

    const hookResB = await fetch(`${API_BASE}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        url: 'http://localhost:5000/api/test/webhook/success',
        secret: 'sec-phase4-userB',
      }),
    });
    const hookDataB = await hookResB.json();
    assert(hookResB.status === 201, 'User B Webhook Registered Successfully');

    // Verify GET /api/webhooks does NOT leak secret
    const listHooksResA = await fetch(`${API_BASE}/webhooks`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const listHooksDataA = await listHooksResA.json();
    assert(
      listHooksDataA.webhooks[0].secret === undefined,
      'GET /api/webhooks DOES NOT Expose Webhook Secrets',
      'Secret field removed via toJSON transform.'
    );

    // -------------------------------------------------------------------------
    // STEP 5: EVENT PUBLISHING & ASYNC DELIVERIES (PHASE 3 REGRESSION)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: EVENT PUBLISHING & QUEUE JOB ENQUEUEING ---');

    const startTime = Date.now();
    const eventRes = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ type: 'payment.completed', payload: { invoiceId: 'INV-999', amount: 499 } }),
    });
    const duration = Date.now() - startTime;
    const eventData = await eventRes.json();

    assert(eventRes.status === 201, 'Event Published via API');
    assert(duration < 300, 'Non-Blocking API Response Time', `Completed in ${duration} ms (<300ms)`);
    assert(eventData.queuedJobsCount === 1, 'BullMQ Delivery Job Enqueued Asynchronously');

    // -------------------------------------------------------------------------
    // STEP 6: WORKER PROCESSING, HMAC SIGNING & IDEMPOTENCY HEADERS
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 6: WORKER DELIVERY WITH HMAC SIGNATURE & IDEMPOTENCY HEADER ---');

    // Wait 2.5s for worker process to consume BullMQ job and update status
    await new Promise((res) => setTimeout(res, 2500));

    const deliveriesRes = await fetch(`${API_BASE}/deliveries`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const deliveriesData = await deliveriesRes.json();
    const delivery = deliveriesData.deliveries[0];

    assert(delivery !== undefined, 'Delivery Tracking Record Fetched');
    assert(delivery.status === 'SUCCESS', 'Delivery Status Reached SUCCESS', `Status: ${delivery.status}`);
    assert(delivery.responseStatus === 200, 'Target Webhook Responded 200 OK via Signature Verification');
    assert(delivery.attempts === 1, 'Delivery Succeeded on 1st Attempt');

    // -------------------------------------------------------------------------
    // STEP 7: WORKER IDEMPOTENCY GUARD TEST
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 7: WORKER IDEMPOTENCY GUARD VERIFICATION ---');

    const mockJob = {
      id: 'mock-job-idempotency-123',
      data: { deliveryId: delivery.id },
      attemptsMade: 1,
      opts: { attempts: 3 },
    };

    // Calling processDeliveryJob directly on an already-SUCCESS delivery record
    await processDeliveryJob(mockJob);
    
    // Refresh delivery record from DB
    const recheckedDelivery = await Delivery.findById(delivery.id);
    assert(
      recheckedDelivery.status === 'SUCCESS' && recheckedDelivery.attempts === 1,
      'Idempotency Guard SKIPPED Duplicate Execution on SUCCESS Delivery',
      'Attempts count remained 1; status remained SUCCESS.'
    );

    // -------------------------------------------------------------------------
    // STEP 8: MULTIPLE WEBHOOKS WITH DISTINCT HMAC SECRETS
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 8: MULTIPLE WEBHOOKS WITH DISTINCT SECRETS ---');

    // User A adds a second webhook
    await fetch(`${API_BASE}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        url: 'http://localhost:5000/api/test/webhook/success',
        secret: 'sec-phase4-userA-second',
      }),
    });

    const multiEventRes = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ type: 'multi.webhook.test', payload: { testId: 'MULTI-01' } }),
    });
    const multiEventData = await multiEventRes.json();
    assert(multiEventData.queuedJobsCount === 2, 'Event Dispatched to 2 Active Webhooks (2 BullMQ Jobs Enqueued)');

    // Wait for worker processing
    await new Promise((res) => setTimeout(res, 2500));

    const userADeliveriesRes = await fetch(`${API_BASE}/deliveries`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const userADeliveriesData = await userADeliveriesRes.json();

    assert(
      userADeliveriesData.deliveries.length >= 3,
      'Multiple Independent Deliveries Created & Tracked in MongoDB'
    );

    // -------------------------------------------------------------------------
    // STEP 9: CROSS-USER AUTHORIZATION ISOLATION (SECURITY AUDIT)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 9: CROSS-USER AUTHORIZATION ISOLATION AUDIT ---');

    const crossUserRes = await fetch(`${API_BASE}/deliveries/${delivery.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(crossUserRes.status === 404, 'User B CANNOT Access User A Delivery Record (404 Not Found)');

    // -------------------------------------------------------------------------
    // FINAL SUMMARY REPORT
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log(`   PHASE 4 COMPREHENSIVE INTEGRATION SUITE COMPLETE: ${passedCount}/${totalCount} PASSED`);
    console.log('========================================================================\n');

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ PHASE 4 SUITE FAILED WITH EXCEPTION: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runPhase4Tests();
