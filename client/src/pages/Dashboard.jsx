import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import {
  Webhook,
  Send,
  Clock,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Globe,
  Key,
  Code2,
  Activity,
  Layers,
  Cpu,
  XCircle,
} from 'lucide-react';

const Dashboard = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('webhooks');

  // Webhooks State
  const [webhooks, setWebhooks] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookError, setWebhookError] = useState('');
  const [webhookSuccess, setWebhookSuccess] = useState('');
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [submittingWebhook, setSubmittingWebhook] = useState(false);

  // Events State
  const [events, setEvents] = useState([]);
  const [eventType, setEventType] = useState('user.created');
  const [eventPayloadStr, setEventPayloadStr] = useState(
    JSON.stringify({ userId: 42, email: 'anitha@example.com' }, null, 2)
  );
  const [eventError, setEventError] = useState('');
  const [eventSuccess, setEventSuccess] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [submittingEvent, setSubmittingEvent] = useState(false);

  // Deliveries State
  const [deliveries, setDeliveries] = useState([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);

  // Helper to handle URL change & sync secret if URL contains ?secret=
  const handleUrlChange = (urlVal) => {
    setWebhookUrl(urlVal);
    if (urlVal.includes('?')) {
      try {
        const queryString = urlVal.split('?')[1];
        const params = new URLSearchParams(queryString);
        const secretParam = params.get('secret');
        if (secretParam && secretParam.trim().length >= 3) {
          setWebhookSecret(secretParam.trim());
        }
      } catch (e) {
        // Ignore parsing errors while typing incomplete URLs
      }
    }
  };

  // Helper to handle Secret change & sync URL query string if present
  const handleSecretChange = (secretVal) => {
    setWebhookSecret(secretVal);
    if (webhookUrl.includes('?secret=')) {
      try {
        const [baseUrl, queryString] = webhookUrl.split('?');
        const params = new URLSearchParams(queryString);
        params.set('secret', secretVal);
        setWebhookUrl(`${baseUrl}?${params.toString()}`);
      } catch (e) {
        // Ignore parsing errors while typing incomplete secrets
      }
    }
  };

  // Fetch Webhooks
  const fetchWebhooks = async () => {
    setLoadingWebhooks(true);
    try {
      const res = await apiService.getWebhooks(token);
      if (res.success) {
        setWebhooks(res.webhooks || []);
      }
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  // Fetch Events
  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await apiService.getEvents(token);
      if (res.success) {
        setEvents(res.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Fetch Deliveries
  const fetchDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const res = await apiService.getDeliveries(token);
      if (res.success) {
        setDeliveries(res.deliveries || []);
      }
    } catch (err) {
      console.error('Failed to fetch deliveries:', err);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchWebhooks();
      fetchEvents();
      fetchDeliveries();
    }
  }, [token]);

  // Auto-refresh deliveries every 3 seconds if active tab is deliveries
  useEffect(() => {
    let interval;
    if (token && activeTab === 'deliveries') {
      interval = setInterval(() => {
        fetchDeliveries();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [token, activeTab]);

  // Handle Webhook Registration
  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    setWebhookError('');
    setWebhookSuccess('');

    if (!webhookUrl || !webhookSecret) {
      setWebhookError('Please provide both Webhook URL and Secret.');
      return;
    }

    setSubmittingWebhook(true);
    try {
      const res = await apiService.createWebhook(
        { url: webhookUrl, secret: webhookSecret },
        token
      );
      if (res.success) {
        setWebhookSuccess('Webhook registered successfully.');
        setWebhookUrl('');
        setWebhookSecret('');
        fetchWebhooks();
      }
    } catch (err) {
      setWebhookError(err.data?.message || err.message || 'Failed to create webhook.');
    } finally {
      setSubmittingWebhook(false);
    }
  };

  // Handle Webhook Deletion
  const handleDeleteWebhook = async (id) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) return;
    try {
      const res = await apiService.deleteWebhook(id, token);
      if (res.success) {
        fetchWebhooks();
        fetchDeliveries();
      }
    } catch (err) {
      alert(err.data?.message || err.message || 'Failed to delete webhook.');
    }
  };

  // Handle Event Creation
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setEventError('');
    setEventSuccess('');

    if (!eventType) {
      setEventError('Event type is required.');
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(eventPayloadStr);
    } catch (err) {
      setEventError('Invalid JSON format in payload text area.');
      return;
    }

    setSubmittingEvent(true);
    try {
      const res = await apiService.createEvent(
        { type: eventType, payload: parsedPayload },
        token
      );
      if (res.success) {
        setEventSuccess(res.message);
        fetchEvents();
        fetchDeliveries();
      }
    } catch (err) {
      setEventError(err.data?.message || err.message || 'Failed to trigger event.');
    } finally {
      setSubmittingEvent(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3 h-3" />
            SUCCESS
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" />
            FAILED
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1 w-fit animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            PROCESSING
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 w-fit">
            <Clock className="w-3 h-3" />
            PENDING
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">HookFlow Dashboard</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Phase 4 Active
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            HMAC-SHA256 Webhook Signing • Delivery Idempotency Protection • Redis & BullMQ Workers
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <span className="text-slate-200 font-semibold block">{user?.name}</span>
            <span className="text-slate-400">{user?.email}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'webhooks'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Webhook className="w-4 h-4" />
          <span>Webhooks ({webhooks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'events'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Events ({events.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('deliveries')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'deliveries'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Deliveries ({deliveries.length})</span>
        </button>
      </div>

      {/* TAB 1: WEBHOOKS */}
      {activeTab === 'webhooks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Webhook Registration Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 h-fit">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Register New Webhook
            </h2>

            {webhookError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{webhookError}</span>
              </div>
            )}

            {webhookSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{webhookSuccess}</span>
              </div>
            )}

            {/* Test Endpoint Helpers */}
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Quick Test Endpoints
              </span>
              <div className="flex flex-col gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setWebhookUrl('http://localhost:5000/api/test/webhook/success');
                    setWebhookSecret('sec-success-123');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-left transition-all text-[11px]"
                >
                  ✓ 200 OK Test Endpoint
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWebhookUrl('http://localhost:5000/api/test/webhook/verify?secret=sec-verify-123');
                    setWebhookSecret('sec-verify-123');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-left transition-all text-[11px]"
                >
                  🔒 HMAC Auto-Verifying Endpoint
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWebhookUrl('http://localhost:5000/api/test/webhook/fail');
                    setWebhookSecret('sec-fail-123');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-left transition-all text-[11px]"
                >
                  ✗ 500 Error Test Endpoint
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWebhookUrl('http://localhost:5000/api/test/webhook/intermittent');
                    setWebhookSecret('sec-intermittent-123');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-left transition-all text-[11px]"
                >
                  ⚡ Intermittent Retry Endpoint (Fails 2x, Succeeds 3rd)
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-4 text-sm pt-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Target Endpoint URL
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://example.com/webhook"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Webhook Secret (Min 3 chars)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => handleSecretChange(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={3}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submittingWebhook}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-md transition-all text-xs disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingWebhook ? 'Saving...' : 'Add Webhook Endpoint'}
              </button>
            </form>
          </div>

          {/* Webhooks List */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Webhook className="w-5 h-5 text-indigo-400" />
                Registered Webhooks ({webhooks.length})
              </h2>
              <button
                onClick={fetchWebhooks}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loadingWebhooks ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {webhooks.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No webhooks registered yet. Use the form to add your first endpoint.
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((w) => (
                  <div
                    key={w.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-indigo-300 font-semibold truncate">
                          {w.url}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            w.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {w.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
                        <span>ID: {w.id}</span>
                        <span>Created: {new Date(w.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteWebhook(w.id)}
                      className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all"
                      title="Delete Webhook"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EVENTS */}
      {activeTab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Event Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 h-fit">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-indigo-400" />
              Publish New Event
            </h2>

            {eventError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{eventError}</span>
              </div>
            )}

            {eventSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{eventSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateEvent} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Event Type
                </label>
                <div className="relative">
                  <Activity className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    placeholder="user.created / order.paid"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  JSON Payload
                </label>
                <div className="relative">
                  <textarea
                    rows={6}
                    value={eventPayloadStr}
                    onChange={(e) => setEventPayloadStr(e.target.value)}
                    required
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submittingEvent}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-md transition-all text-xs disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingEvent ? 'Triggering...' : 'Publish Event (Async Queue)'}
              </button>
            </form>
          </div>

          {/* Events List */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Code2 className="w-5 h-5 text-indigo-400" />
                Triggered Events ({events.length})
              </h2>
              <button
                onClick={fetchEvents}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loadingEvents ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No events triggered yet. Use the form to publish an event.
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((e) => (
                  <div key={e.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-indigo-400 uppercase tracking-wider">
                          {e.type}
                        </span>
                        <span className="text-slate-500 text-[11px]">ID: {e.id}</span>
                      </div>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <pre className="p-3 bg-slate-900 rounded-lg font-mono text-xs text-slate-300 overflow-x-auto border border-slate-800/80">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DELIVERIES */}
      {activeTab === 'deliveries' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Live Delivery Tracking Log ({deliveries.length})
              </h2>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Asynchronous BullMQ Worker Active • Auto-refreshing every 3 seconds
              </p>
            </div>

            <button
              onClick={fetchDeliveries}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDeliveries ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {deliveries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No delivery records found. Publish an event while active webhooks are registered to see real-time delivery tracking.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">Target Webhook URL</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Attempts</th>
                    <th className="py-3 px-4">HTTP Status</th>
                    <th className="py-3 px-4">Error Log</th>
                    <th className="py-3 px-4">Last Attempt At</th>
                    <th className="py-3 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-950/50">
                      <td className="py-3 px-4 font-bold text-indigo-400">{d.eventType}</td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{d.webhookUrl}</td>
                      <td className="py-3 px-4">{getStatusBadge(d.status)}</td>
                      <td className="py-3 px-4 text-slate-200 font-bold">{d.attempts} / 3</td>
                      <td className="py-3 px-4">
                        {d.responseStatus ? (
                          <span
                            className={`font-bold ${
                              d.responseStatus >= 200 && d.responseStatus < 300
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {d.responseStatus}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-rose-400/90 text-[11px]">
                        {d.error || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {d.lastAttemptAt
                          ? new Date(d.lastAttemptAt).toLocaleString()
                          : new Date(d.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedDelivery(d)}
                          className="px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all text-[11px]"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delivery Inspection Modal */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Delivery Inspection Details</h3>
              </div>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-mono">
                    Delivery ID (Idempotency Key)
                  </span>
                  <span className="text-indigo-300 font-mono font-bold break-all">{selectedDelivery.id}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-mono mb-1">
                    Delivery Status
                  </span>
                  {getStatusBadge(selectedDelivery.status)}
                </div>
              </div>

              <div className="space-y-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-mono">
                    Event Type & ID
                  </span>
                  <span className="text-slate-200 font-mono">
                    {selectedDelivery.eventType} ({selectedDelivery.eventId})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-mono">
                    Target Webhook Endpoint
                  </span>
                  <span className="text-slate-300 font-mono break-all">{selectedDelivery.webhookUrl}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-mono">
                    Attempts
                  </span>
                  <span className="text-slate-200 font-bold">{selectedDelivery.attempts} / 3</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-mono">
                    HTTP Response
                  </span>
                  <span
                    className={`font-bold ${
                      selectedDelivery.responseStatus >= 200 && selectedDelivery.responseStatus < 300
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {selectedDelivery.responseStatus || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-mono">
                    Signature Security
                  </span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> HMAC-SHA256
                  </span>
                </div>
              </div>

              {selectedDelivery.error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 font-mono text-[11px]">
                  <span className="font-bold block mb-1">Error Details:</span>
                  {selectedDelivery.error}
                </div>
              )}

              <div className="text-[11px] text-slate-500 flex justify-between pt-2 font-mono border-t border-slate-800/80">
                <span>Created: {new Date(selectedDelivery.createdAt).toLocaleString()}</span>
                <span>
                  Last Attempt:{' '}
                  {selectedDelivery.lastAttemptAt
                    ? new Date(selectedDelivery.lastAttemptAt).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDelivery(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-all"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

