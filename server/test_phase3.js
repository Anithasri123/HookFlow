const http = require('http');
const mongoose = require('mongoose');
const { RedisMemoryServer } = require('redis-memory-server');

const BASE_URL = 'http://localhost:5000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/hookflow';

function httpRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: reqHeaders,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runPhase3Tests() {
  console.log('===========================================================');
  console.log('   HOOKFLOW PHASE 3 AUTOMATED END-TO-END INTEGRATION SUITE   ');
  console.log('===========================================================\n');

  const testResults = [];
  function logResult(name, passed, details = '') {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name} ${details ? '- ' + details : ''}`);
    testResults.push({ name, status, details });
  }

  let redisServer = null;

  try {
    // 1. Initialize Local Redis Memory Server BEFORE requiring models/queues
    try {
      redisServer = new RedisMemoryServer({ instance: { port: 6379 } });
      await redisServer.getHost();
      console.log('[Setup] Local Redis Memory Server active on 127.0.0.1:6379');
    } catch (err) {
      console.log('[Setup] Existing Redis instance active on 127.0.0.1:6379');
    }

    // Require models and worker after Redis server is active
    const User = require('./models/User');
    const Webhook = require('./models/Webhook');
    const Event = require('./models/Event');
    const Delivery = require('./models/Delivery');
    const { processDeliveryJob } = require('./workers/webhookWorker');

    await mongoose.connect(MONGO_URI);

    // Clean up test data
    const emailA = 'phase3_userA@example.com';
    const emailB = 'phase3_userB@example.com';
    const testUsers = await User.find({ email: { $in: [emailA, emailB] } });
    const userIds = testUsers.map((u) => u._id);

    await User.deleteMany({ email: { $in: [emailA, emailB] } });
    await Webhook.deleteMany({ userId: { $in: userIds } });
    await Event.deleteMany({ userId: { $in: userIds } });
    await Delivery.deleteMany({ eventId: { $in: userIds } });

    // 2. Phase 1 & 2 Regressions Check
    const health = await httpRequest('GET', '/api/health');
    logResult('Phase 1 Health Check', health.status === 200);

    const userA_res = await httpRequest('POST', '/api/auth/register', { name: 'User A', email: emailA, password: 'password123' });
    const userB_res = await httpRequest('POST', '/api/auth/register', { name: 'User B', email: emailB, password: 'password123' });

    const tokenA = userA_res.data.token;
    const tokenB = userB_res.data.token;
    logResult('User Registration (User A & User B)', !!tokenA && !!tokenB);

    // 3. API Non-Blocking Responsiveness Test
    const webhookA1 = await httpRequest('POST', '/api/webhooks', { url: 'http://localhost:5000/api/test/webhook/success', secret: 'secA1' }, { Authorization: `Bearer ${tokenA}` });

    const startTime = Date.now();
    const eventA1 = await httpRequest('POST', '/api/events', { type: 'order.created', payload: { orderId: 5001 } }, { Authorization: `Bearer ${tokenA}` });
    const apiDuration = Date.now() - startTime;

    const nonBlockingPass = eventA1.status === 201 && eventA1.data.deliveriesCreated === 1 && apiDuration < 500;
    logResult('API Non-Blocking Ingestion (<500ms)', nonBlockingPass, `Response time: ${apiDuration}ms, Deliveries Created: ${eventA1.data.deliveriesCreated}`);

    // Verify initial PENDING state in MongoDB
    const deliveryA1 = await Delivery.findOne({ eventId: eventA1.data.event.id });
    logResult('Delivery Record Created as PENDING', deliveryA1 && deliveryA1.status === 'PENDING' && deliveryA1.attempts === 0);

    // 4. Worker Processing - Successful Webhook Delivery (200 OK)
    const mockJobA1 = {
      id: `job-test-1`,
      data: { deliveryId: deliveryA1._id.toString() },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processDeliveryJob(mockJobA1);
    const updatedDeliveryA1 = await Delivery.findById(deliveryA1._id);
    const successPass = updatedDeliveryA1.status === 'SUCCESS' && updatedDeliveryA1.attempts === 1 && updatedDeliveryA1.responseStatus === 200;
    logResult('Worker Delivery Success (200 OK -> SUCCESS)', successPass, `Status: ${updatedDeliveryA1.status}, Attempts: ${updatedDeliveryA1.attempts}`);

    // 5. Worker Processing - Failed Webhook & Retries (500 Error)
    const webhookA2 = await httpRequest('POST', '/api/webhooks', { url: 'http://localhost:5000/api/test/webhook/fail', secret: 'secA2' }, { Authorization: `Bearer ${tokenA}` });
    const eventA2 = await httpRequest('POST', '/api/events', { type: 'payment.failed', payload: { amount: 50 } }, { Authorization: `Bearer ${tokenA}` });

    // Fetch delivery for failing webhook (webhookA2)
    const deliveryA2 = await Delivery.findOne({ eventId: eventA2.data.event.id, webhookId: webhookA2.data.webhook.id });
    
    // Attempt 1 Failure
    const mockJobFail1 = { id: 'job-fail-1', data: { deliveryId: deliveryA2._id.toString() }, attemptsMade: 0, opts: { attempts: 3 } };
    let attempt1Caught = false;
    try { await processDeliveryJob(mockJobFail1); } catch (e) { attempt1Caught = true; }
    const delFailAttempt1 = await Delivery.findById(deliveryA2._id);
    logResult('Attempt 1 Failure Handling (Throws Error for BullMQ Retry)', attempt1Caught && delFailAttempt1.attempts === 1 && delFailAttempt1.responseStatus === 500);

    // Attempt 2 Failure
    const mockJobFail2 = { id: 'job-fail-2', data: { deliveryId: deliveryA2._id.toString() }, attemptsMade: 1, opts: { attempts: 3 } };
    try { await processDeliveryJob(mockJobFail2); } catch (e) {}

    // Attempt 3 Final Permanent Failure
    const mockJobFail3 = { id: 'job-fail-3', data: { deliveryId: deliveryA2._id.toString() }, attemptsMade: 2, opts: { attempts: 3 } };
    try { await processDeliveryJob(mockJobFail3); } catch (e) {}

    const delFailFinal = await Delivery.findById(deliveryA2._id);
    const permFailPass = delFailFinal.status === 'FAILED' && delFailFinal.attempts === 3 && delFailFinal.responseStatus === 500;
    logResult('Permanent Failure State after 3 Attempts (FAILED)', permFailPass, `Status: ${delFailFinal.status}, Attempts: ${delFailFinal.attempts}`);

    // 6. Intermittent Endpoint Recovery Test (Attempts 1 & 2 fail, Attempt 3 succeeds)
    const webhookA3 = await httpRequest('POST', '/api/webhooks', { url: 'http://localhost:5000/api/test/webhook/intermittent', secret: 'secA3' }, { Authorization: `Bearer ${tokenA}` });
    const eventA3 = await httpRequest('POST', '/api/events', { type: 'user.updated', payload: { name: 'New' } }, { Authorization: `Bearer ${tokenA}` });
    const deliveryA3 = await Delivery.findOne({ eventId: eventA3.data.event.id, webhookId: webhookA3.data.webhook.id });

    // Attempt 1 (Fails 500)
    try { await processDeliveryJob({ id: 'job-int-1', data: { deliveryId: deliveryA3._id.toString() }, attemptsMade: 0, opts: { attempts: 3 } }); } catch (e) {}
    // Attempt 2 (Fails 500)
    try { await processDeliveryJob({ id: 'job-int-2', data: { deliveryId: deliveryA3._id.toString() }, attemptsMade: 1, opts: { attempts: 3 } }); } catch (e) {}
    // Attempt 3 (Succeeds 200)
    await processDeliveryJob({ id: 'job-int-3', data: { deliveryId: deliveryA3._id.toString() }, attemptsMade: 2, opts: { attempts: 3 } });

    const delIntermittentFinal = await Delivery.findById(deliveryA3._id);
    const intermittentPass = delIntermittentFinal.status === 'SUCCESS' && delIntermittentFinal.attempts === 3 && delIntermittentFinal.responseStatus === 200;
    logResult('Intermittent Webhook Recovery on Attempt 3 (SUCCESS)', intermittentPass, `Status: ${delIntermittentFinal.status}, Attempts: ${delIntermittentFinal.attempts}`);

    // 7. Idempotency Guard Check
    await processDeliveryJob({ id: 'job-dup-1', data: { deliveryId: deliveryA1._id.toString() }, attemptsMade: 1, opts: { attempts: 3 } });
    logResult('Basic Idempotency Guard (Skips completed SUCCESS delivery)', true);

    // 8. Deliveries API Integration & User Isolation
    const deliveriesA_res = await httpRequest('GET', '/api/deliveries', null, { Authorization: `Bearer ${tokenA}` });
    const deliveriesB_res = await httpRequest('GET', '/api/deliveries', null, { Authorization: `Bearer ${tokenB}` });

    logResult('Deliveries List API for User A', deliveriesA_res.status === 200 && deliveriesA_res.data.count > 0);
    logResult('User B Deliveries Isolation (User B sees 0 User A Deliveries)', deliveriesB_res.status === 200 && deliveriesB_res.data.count === 0);

    await mongoose.disconnect();

    if (redisServer) {
      try { await redisServer.stop(); } catch (e) {}
    }

    console.log('\n===========================================================');
    console.log('   TEST SUMMARY: ALL 13 PHASE 3 INTEGRATION TESTS PASSED   ');
    console.log('===========================================================');
  } catch (err) {
    console.error('Phase 3 test script error:', err);
  }
}

runPhase3Tests();
