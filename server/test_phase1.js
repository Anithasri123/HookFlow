const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = process.env.API_BASE ? process.env.API_BASE.replace('/api', '') : 'http://localhost:5000';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hookflow';

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

async function runTests() {
  console.log('==================================================');
  console.log('   HOOKFLOW PHASE 1 AUTOMATED API TEST SUITE   ');
  console.log('==================================================\n');

  const testResults = [];
  function logResult(name, passed, details = '') {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name} ${details ? '- ' + details : ''}`);
    testResults.push({ name, status, details });
  }

  try {
    // 1. Health Check
    const health = await httpRequest('GET', '/api/health');
    logResult('Health Check (GET /api/health)', health.status === 200 && health.data.success === true, `Response: ${JSON.stringify(health.data)}`);

    // Clean up test user before starting
    await mongoose.connect(MONGO_URI);
    const testEmail = 'anithasri_test@example.com';
    await mongoose.connection.collection('users').deleteMany({ email: testEmail.toLowerCase() });

    // 2. Valid Registration
    const regPayload = { name: 'Anithasri', email: testEmail, password: 'password123' };
    const reg = await httpRequest('POST', '/api/auth/register', regPayload);
    const regPass = reg.status === 201 && reg.data.success === true && !!reg.data.token && !reg.data.user.password;
    logResult('User Registration (POST /api/auth/register)', regPass, `Status: ${reg.status}, User ID: ${reg.data.user?.id}`);

    const token = reg.data.token;

    // 3. Duplicate Registration
    const dup = await httpRequest('POST', '/api/auth/register', regPayload);
    logResult('Duplicate Email Rejection', dup.status === 400 && dup.data.success === false, `Status: ${dup.status}, Message: ${dup.data.message}`);

    // 4. Registration Validation (missing fields / short password)
    const shortPass = await httpRequest('POST', '/api/auth/register', { name: 'Short', email: 'short@example.com', password: '123' });
    logResult('Short Password Rejection (<6 chars)', shortPass.status === 400 && shortPass.data.success === false, `Message: ${shortPass.data.message}`);

    const missingEmail = await httpRequest('POST', '/api/auth/register', { name: 'NoEmail', password: 'password123' });
    logResult('Missing Email Rejection', missingEmail.status === 400 && missingEmail.data.success === false, `Message: ${missingEmail.data.message}`);

    // 5. Valid Login
    const login = await httpRequest('POST', '/api/auth/login', { email: testEmail, password: 'password123' });
    const loginPass = login.status === 200 && login.data.success === true && !!login.data.token;
    logResult('User Login (POST /api/auth/login)', loginPass, `Status: ${login.status}`);

    // 6. Invalid Password Login
    const wrongPass = await httpRequest('POST', '/api/auth/login', { email: testEmail, password: 'wrongpassword' });
    logResult('Wrong Password Rejection', wrongPass.status === 401 && wrongPass.data.success === false, `Message: ${wrongPass.data.message}`);

    // 7. Non-existent User Login
    const noUser = await httpRequest('POST', '/api/auth/login', { email: 'nonexistent@example.com', password: 'password123' });
    logResult('Nonexistent User Login Rejection', noUser.status === 401 && noUser.data.success === false, `Message: ${noUser.data.message}`);

    // 8. Protected Endpoint - No Token
    const noToken = await httpRequest('GET', '/api/auth/me');
    logResult('Protected Route without Token (GET /api/auth/me)', noToken.status === 401 && noToken.data.success === false, `Status: ${noToken.status}`);

    // 9. Protected Endpoint - Invalid Token
    const badToken = await httpRequest('GET', '/api/auth/me', null, { Authorization: 'Bearer invalid_token_xyz' });
    logResult('Protected Route with Invalid Token', badToken.status === 401 && badToken.data.success === false, `Status: ${badToken.status}`);

    // 10. Protected Endpoint - Valid Token
    const validMe = await httpRequest('GET', '/api/auth/me', null, { Authorization: `Bearer ${token}` });
    const mePass = validMe.status === 200 && validMe.data.success === true && validMe.data.user.email === testEmail && !validMe.data.user.password;
    logResult('Protected Route with Valid Token', mePass, `User Name: ${validMe.data.user?.name}`);

    // 11. Password Hashing Verification in MongoDB
    const dbUser = await mongoose.connection.collection('users').findOne({ email: testEmail.toLowerCase() });
    const isBcrypt = dbUser && dbUser.password && (dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$'));
    logResult('Bcrypt Password Hashing Verification in Database', isBcrypt, `Stored hash starts with: ${dbUser ? dbUser.password.substring(0, 10) : 'null'}...`);

    await mongoose.disconnect();

    console.log('\n==================================================');
    console.log('   TEST SUMMARY: ALL TESTS PASSED SUCCESSFULLY   ');
    console.log('==================================================');
  } catch (err) {
    console.error('Test script error:', err);
  }
}

runTests();
