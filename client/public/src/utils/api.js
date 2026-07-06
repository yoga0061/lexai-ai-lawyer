/**
 * Client API Utilities for LexAI v2
 */

// Helper to get auth header if available
function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('authToken');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function getLegalAdvice({ messages, message, mode, language, conversationId, signal }) {
  const controller = new AbortController();
  let isTimeout = false;

  const timeoutId = setTimeout(() => {
    isTimeout = true;
    controller.abort();
  }, 45000); // 45s Timeout

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ messages, message, mode, language, conversationId }),
      signal: controller.signal
    });

    let data;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(text || `Server error (Status: ${res.status})`);
    }

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to retrieve legal advice.');
    }

    return data; // returns { answer, conversationId, courtroomId }
  } catch (error) {
    if (error.name === 'AbortError') {
      if (isTimeout) {
        throw new Error('Request timed out. The legal AI is currently taking longer than expected. Please try again.');
      }
      console.warn('API request aborted by user');
      throw error;
    }
    console.error('getLegalAdvice error:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function analyzeDocument({ filename, content, signal }) {
  const controller = new AbortController();
  let isTimeout = false;

  const timeoutId = setTimeout(() => {
    isTimeout = true;
    controller.abort();
  }, 45000); // 45s Timeout

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ filename, content }),
      signal: controller.signal
    });

    let data;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(text || `Server error (Status: ${res.status})`);
    }

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to analyze document.');
    }

    return data; // returns { id, filename, analysis: { summary, risks, clauses } }
  } catch (error) {
    if (error.name === 'AbortError') {
      if (isTimeout) {
        throw new Error('Document analysis request timed out. Please try again.');
      }
      console.warn('Document analysis aborted');
      throw error;
    }
    console.error('analyzeDocument error:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* User Authentication endpoints */

export async function registerUser({ username, email, password }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to register account');
  return data; // { token, user: { id, username, email, preferredLanguage } }
}

export async function loginUser({ email, password }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to authenticate');
  return data; // { token, user: { id, username, email, preferredLanguage } }
}

export async function getCurrentUser() {
  const token = localStorage.getItem('authToken');
  if (!token) return null;

  const res = await fetch('/api/auth/me', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) {
    localStorage.removeItem('authToken');
    throw new Error(data.error || 'Session expired');
  }
  return data;
}

/* User History Fetching endpoints */

export async function getConversations() {
  const res = await fetch('/api/history/conversations', {
    method: 'GET',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch conversations history');
  return data;
}

export async function getConversationDetails(id) {
  const res = await fetch(`/api/history/conversations/${id}`, {
    method: 'GET',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch conversation details');
  return data;
}

export async function deleteConversation(id) {
  const res = await fetch(`/api/history/conversations/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete conversation');
  return data;
}

export async function getCourtroomSessions() {
  const res = await fetch('/api/history/courtroom', {
    method: 'GET',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch courtroom sessions list');
  return data;
}

export async function getCourtroomSessionDetails(id) {
  const res = await fetch(`/api/history/courtroom/${id}`, {
    method: 'GET',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch courtroom session details');
  return data;
}

export async function getDocuments() {
  const res = await fetch('/api/history/documents', {
    method: 'GET',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch document history list');
  return data;
}

export async function getDocumentDetails(id) {
  const res = await fetch(`/api/history/documents/${id}`, {
    method: 'GET',
    headers: getHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch document audit details');
  return data;
}
