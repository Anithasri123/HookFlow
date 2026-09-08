/**
 * Centralized API Service Layer
 * Encapsulates fetch calls to the HookFlow backend REST API.
 */

const API_BASE_URL = '/api';

/**
 * Base helper for making API HTTP requests
 */
async function request(endpoint, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: 'Invalid server response',
  }));

  if (!response.ok) {
    const error = new Error(data.message || 'API request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const apiService = {
  // Unauthenticated health check
  getHealth: () => request('/health'),

  // Phase 1 Authentication
  register: (userData) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  login: (credentials) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  getMe: (token) =>
    request('/auth/me', {
      method: 'GET',
    }, token),

  // Phase 2 Webhook Endpoints
  createWebhook: (webhookData, token) =>
    request('/webhooks', {
      method: 'POST',
      body: JSON.stringify(webhookData),
    }, token),

  getWebhooks: (token) =>
    request('/webhooks', {
      method: 'GET',
    }, token),

  deleteWebhook: (id, token) =>
    request(`/webhooks/${id}`, {
      method: 'DELETE',
    }, token),

  // Phase 2 Event Endpoints
  createEvent: (eventData, token) =>
    request('/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    }, token),

  getEvents: (token) =>
    request('/events', {
      method: 'GET',
    }, token),

  getEvent: (id, token) =>
    request(`/events/${id}`, {
      method: 'GET',
    }, token),

  // Phase 2 Delivery Endpoints
  getDeliveries: (token) =>
    request('/deliveries', {
      method: 'GET',
    }, token),

  getDelivery: (id, token) =>
    request(`/deliveries/${id}`, {
      method: 'GET',
    }, token),
};
