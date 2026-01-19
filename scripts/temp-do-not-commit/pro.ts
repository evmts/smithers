/**
 * ChatGPT API Traffic Inspector
 *
 * INTENDED FOR ETHICAL USE CASES ONLY:
 * - Educational research and learning
 * - Building test mocks and fixtures
 * - API compatibility testing
 * - Security research with proper authorization
 *
 * Do not use for unauthorized access, scraping, or violating terms of service.
 */

const inspectorScript = `
(function() {
  // Storage for captured traffic
  const traffic = {
    http: [],
    websocket: [],
    meta: {
      startTime: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    }
  };

  // Expose globally for easy access
  window.__API_TRAFFIC__ = traffic;

  // === HTTP INTERCEPTION ===

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, options = {}] = args;
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    const entry = {
      id: requestId,
      type: 'fetch',
      timestamp: startTime,
      request: {
        url: url.toString(),
        method: options.method || 'GET',
        headers: options.headers ? Object.fromEntries(
          options.headers instanceof Headers
            ? options.headers.entries()
            : Object.entries(options.headers)
        ) : {},
        body: options.body ? tryParseBody(options.body) : null
      },
      response: null,
      duration: null,
      error: null
    };

    traffic.http.push(entry);
    log('fetch', entry.request.method, entry.request.url);

    try {
      const response = await originalFetch.apply(this, args);
      const clone = response.clone();

      entry.duration = Date.now() - startTime;
      entry.response = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: null
      };

      // Try to capture response body
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          entry.response.body = await clone.json();
        } else if (contentType.includes('text') || contentType.includes('event-stream')) {
          entry.response.body = await clone.text();
        }
      } catch (e) {
        entry.response.bodyError = e.message;
      }

      return response;
    } catch (error) {
      entry.error = error.message;
      entry.duration = Date.now() - startTime;
      throw error;
    }
  };

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__inspector__ = {
      id: crypto.randomUUID(),
      method,
      url: url.toString(),
      headers: {},
      startTime: null
    };
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this.__inspector__) {
      this.__inspector__.headers[name] = value;
    }
    return originalXHRSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this.__inspector__) {
      const info = this.__inspector__;
      info.startTime = Date.now();

      const entry = {
        id: info.id,
        type: 'xhr',
        timestamp: info.startTime,
        request: {
          url: info.url,
          method: info.method,
          headers: info.headers,
          body: tryParseBody(body)
        },
        response: null,
        duration: null,
        error: null
      };

      traffic.http.push(entry);
      log('xhr', info.method, info.url);

      this.addEventListener('load', function() {
        entry.duration = Date.now() - info.startTime;
        entry.response = {
          status: this.status,
          statusText: this.statusText,
          headers: parseXHRHeaders(this.getAllResponseHeaders()),
          body: tryParseBody(this.responseText)
        };
      });

      this.addEventListener('error', function() {
        entry.error = 'Network error';
        entry.duration = Date.now() - info.startTime;
      });
    }
    return originalXHRSend.apply(this, arguments);
  };

  // === WEBSOCKET INTERCEPTION ===

  const originalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    const ws = new originalWebSocket(url, protocols);
    const wsId = crypto.randomUUID();

    const wsEntry = {
      id: wsId,
      url: url.toString(),
      protocols: protocols,
      openedAt: null,
      closedAt: null,
      closeCode: null,
      closeReason: null,
      messages: {
        sent: [],
        received: []
      }
    };

    traffic.websocket.push(wsEntry);
    log('ws', 'connect', url);

    ws.addEventListener('open', () => {
      wsEntry.openedAt = Date.now();
      log('ws', 'open', url);
    });

    ws.addEventListener('close', (e) => {
      wsEntry.closedAt = Date.now();
      wsEntry.closeCode = e.code;
      wsEntry.closeReason = e.reason;
      log('ws', 'close', url, e.code);
    });

    ws.addEventListener('message', (e) => {
      const msg = {
        timestamp: Date.now(),
        data: tryParseBody(e.data)
      };
      wsEntry.messages.received.push(msg);
      log('ws', 'recv', truncate(String(e.data), 100));
    });

    // Intercept send
    const originalSend = ws.send.bind(ws);
    ws.send = function(data) {
      const msg = {
        timestamp: Date.now(),
        data: tryParseBody(data)
      };
      wsEntry.messages.sent.push(msg);
      log('ws', 'send', truncate(String(data), 100));
      return originalSend(data);
    };

    return ws;
  };
  window.WebSocket.prototype = originalWebSocket.prototype;

  // === UTILITIES ===

  function tryParseBody(data) {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  function parseXHRHeaders(headerStr) {
    const headers = {};
    if (!headerStr) return headers;
    headerStr.split('\\r\\n').forEach(line => {
      const [key, ...vals] = line.split(': ');
      if (key) headers[key.toLowerCase()] = vals.join(': ');
    });
    return headers;
  }

  function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function log(...args) {
    console.log('%c[API Inspector]', 'color: #10b981; font-weight: bold', ...args);
  }

  // === EXPORT HELPERS ===

  window.__exportTraffic__ = () => {
    return JSON.stringify(traffic, null, 2);
  };

  window.__getEndpoints__ = () => {
    const endpoints = new Map();
    traffic.http.forEach(req => {
      const key = req.request.method + ' ' + new URL(req.request.url).pathname;
      if (!endpoints.has(key)) {
        endpoints.set(key, {
          method: req.request.method,
          path: new URL(req.request.url).pathname,
          fullUrls: [],
          requestBodies: [],
          responseBodies: [],
          headers: new Set()
        });
      }
      const ep = endpoints.get(key);
      ep.fullUrls.push(req.request.url);
      if (req.request.body) ep.requestBodies.push(req.request.body);
      if (req.response?.body) ep.responseBodies.push(req.response.body);
      Object.keys(req.request.headers).forEach(h => ep.headers.add(h));
    });

    return Array.from(endpoints.values()).map(ep => ({
      ...ep,
      headers: Array.from(ep.headers),
      fullUrls: [...new Set(ep.fullUrls)]
    }));
  };

  window.__getWebSocketSchemas__ = () => {
    return traffic.websocket.map(ws => ({
      url: ws.url,
      messagesSent: ws.messages.sent.length,
      messagesReceived: ws.messages.received.length,
      sampleSent: ws.messages.sent.slice(0, 5),
      sampleReceived: ws.messages.received.slice(0, 5)
    }));
  };

  console.log('%c[API Inspector] Active', 'color: #10b981; font-weight: bold; font-size: 14px');
  console.log('Commands:');
  console.log('  __API_TRAFFIC__        - Raw traffic data');
  console.log('  __exportTraffic__()    - JSON export');
  console.log('  __getEndpoints__()     - Grouped endpoints');
  console.log('  __getWebSocketSchemas__() - WebSocket summary');
})();
`;

// Output the script for copy-paste into browser console
console.log(inspectorScript);

export { inspectorScript };
