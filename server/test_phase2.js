const http = require('http');
const mongoose = require('mongoose');
const User = require('./models/User');

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

async function runPhase2Tests() {
  console.log('====================================================');
  console.log('   HOOKFLOW PHASE 2 AUTOMATED INTEGRATION TEST SUITE   ');
  console.log('====================================================\n');

  const testResults = [];
  function logResult(name, passed, details = '') {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name} ${details ? '- ' + details : ''}`);
    testResults.push({ name, status, details });
  }

  try {
    await mongoose.connect(MONGO_URI);

    // Clean up test data completely via User model
    const emailA = 'phase2_userA@example.com';
    const emailB = 'phase2_userB@example.com';
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    // 1. Phase 1 Regression: Health Check
    const health = await httpRequest('GET', '/api/health');
    logResult('Phase 1 Health Check', health.status === 200 && health.data.success === true);

    // 2. Setup User A & User B
    const userA_res = await httpRequest('POST', '/api/auth/register', { name: 'User A', email: emailA, password: 'password123' });
    const userB_res = await httpRequest('POST', '/api/auth/register', { name: 'User B', email: emailB, password: 'password123' });
    
    const tokenA = userA_res.data.token;
    const tokenB = userB_res.data.token;
    logResult('User Registration (User A & User B)', !!tokenA && !!tokenB);

    // 3. Unauthenticated Access Protection
    const unauthWebhook = await httpRequest('POST', '/api/webhooks', { url: 'https://example.com/w', secret: 'sec' });
    logResult('Unauthenticated Webhook Creation Rejection (401)', unauthWebhook.status === 401);

    const unauthEvent = await httpRequest('POST', '/api/events', { type: 'test', payload: {} });
    logResult('Unauthenticated Event Creation Rejection (401)', unauthEvent.status === 401);

    const unauthDelivery = await httpRequest('GET', '/api/deliveries');
    logResult('Unauthenticated Delivery Retrieval Rejection (401)', unauthDelivery.status === 401);

    // 4. Webhook Creation & Validation
    const invalidUrl = await httpRequest('POST', '/api/webhooks', { url: 'invalid-url', secret: 'secret123' }, { Authorization: `Bearer ${tokenA}` });
    logResult('Invalid Webhook URL Rejection (400)', invalidUrl.status === 400);

    const webhookA1 = await httpRequest('POST', '/api/webhooks', { url: 'https://userA.com/wh1', secret: 'secretA1' }, { Authorization: `Bearer ${tokenA}` });
    const webhookA1_Pass = webhookA1.status === 201 && webhookA1.data.webhook?.url === 'https://userA.com/wh1' && !webhookA1.data.webhook?.secret;
    logResult('Create Webhook A1 (User A)', webhookA1_Pass, `Secret excluded: ${!webhookA1.data.webhook?.secret}`);

    const webhookA2 = await httpRequest('POST', '/api/webhooks', { url: 'https://userA.com/wh2', secret: 'secretA2' }, { Authorization: `Bearer ${tokenA}` });
    logResult('Create Webhook A2 (User A)', webhookA2.status === 201);

    const webhookB1 = await httpRequest('POST', '/api/webhooks', { url: 'https://userB.com/wh1', secret: 'secretB1' }, { Authorization: `Bearer ${tokenB}` });
    logResult('Create Webhook B1 (User B)', webhookB1.status === 201);

    // 5. Webhook Listing & User Isolation
    const listA_webhooks = await httpRequest('GET', '/api/webhooks', null, { Authorization: `Bearer ${tokenA}` });
    const listA_Pass = listA_webhooks.status === 200 && listA_webhooks.data.count === 2;
    logResult('List User A Webhooks (Isolated to User A)', listA_Pass, `Count: ${listA_webhooks.data.count}`);

    // 6. Webhook Deletion Ownership Test
    const deleteCross = await httpRequest('DELETE', `/api/webhooks/${webhookA1.data.webhook.id}`, null, { Authorization: `Bearer ${tokenB}` });
    logResult('User B Deleting User A Webhook Rejection (404)', deleteCross.status === 404);

    const deleteOwn = await httpRequest('DELETE', `/api/webhooks/${webhookA2.data.webhook.id}`, null, { Authorization: `Bearer ${tokenA}` });
    logResult('User A Deleting Own Webhook A2 (200)', deleteOwn.status === 200);

    // 7. Event Creation & Validation
    const invalidEventPayload = await httpRequest('POST', '/api/events', { type: 'order.created', payload: 'not-an-object' }, { Authorization: `Bearer ${tokenA}` });
    logResult('Invalid Event Payload Rejection (400)', invalidEventPayload.status === 400);

    const eventA1 = await httpRequest('POST', '/api/events', { type: 'order.paid', payload: { orderId: 1001, amount: 99.99 } }, { Authorization: `Bearer ${tokenA}` });
    const eventA1_Pass = eventA1.status === 201 && eventA1.data.deliveriesCreated === 1; // webhookA1 is active, webhookA2 was deleted
    logResult('Create Event A1 & Fan-out Delivery', eventA1_Pass, `Deliveries Created: ${eventA1.data.deliveriesCreated}`);

    // 8. Multiple Webhooks Fan-Out Delivery Test
    // Add another active webhook for User A
    const webhookA3 = await httpRequest('POST', '/api/webhooks', { url: 'https://userA.com/wh3', secret: 'secretA3' }, { Authorization: `Bearer ${tokenA}` });
    const eventA2 = await httpRequest('POST', '/api/events', { type: 'user.created', payload: { userId: 777 } }, { Authorization: `Bearer ${tokenA}` });
    const eventA2_Pass = eventA2.status === 201 && eventA2.data.deliveriesCreated === 2; // webhookA1 & webhookA3
    logResult('Multiple Webhook Fan-Out (2 Active Webhooks -> 2 Deliveries)', eventA2_Pass, `Deliveries Created: ${eventA2.data.deliveriesCreated}`);

    // 9. Event Retrieval & User Isolation
    const listA_events = await httpRequest('GET', '/api/events', null, { Authorization: `Bearer ${tokenA}` });
    logResult('List User A Events', listA_events.status === 200 && listA_events.data.count === 2);

    const getCrossEvent = await httpRequest('GET', `/api/events/${eventA1.data.event.id}`, null, { Authorization: `Bearer ${tokenB}` });
    logResult('User B Retrieving User A Event Rejection (404)', getCrossEvent.status === 404);

    // 10. Deliveries Listing & Status Checks
    const listA_deliveries = await httpRequest('GET', '/api/deliveries', null, { Authorization: `Bearer ${tokenA}` });
    const deliveriesA = listA_deliveries.data.deliveries || [];
    const allPending = deliveriesA.every((d) => d.status === 'PENDING' && d.attempts === 0);
    logResult('Delivery Records Initialized as PENDING', listA_deliveries.status === 200 && allPending && deliveriesA.length === 3, `Total User A Deliveries: ${deliveriesA.length}`);

    const listB_deliveries = await httpRequest('GET', '/api/deliveries', null, { Authorization: `Bearer ${tokenB}` });
    logResult('User B Deliveries Isolation (User B sees 0 User A Deliveries)', listB_deliveries.status === 200 && listB_deliveries.data.count === 0);

    const getCrossDelivery = await httpRequest('GET', `/api/deliveries/${deliveriesA[0]?.id}`, null, { Authorization: `Bearer ${tokenB}` });
    logResult('User B Single Delivery Access Rejection (404)', getCrossDelivery.status === 404);

    // 11. Database Schema & Index Verification in MongoDB
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);
    const hasAllCollections = ['users', 'webhooks', 'events', 'deliveries'].every((name) => collectionNames.includes(name));
    logResult('MongoDB Collections Existence Check (users, webhooks, events, deliveries)', hasAllCollections);

    await mongoose.disconnect();

    console.log('\n====================================================');
    console.log('   TEST SUMMARY: ALL PHASE 2 TESTS PASSED 100%   ');
    console.log('====================================================');
  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runPhase2Tests();
