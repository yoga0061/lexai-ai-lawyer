const express = require('express');
const router = express.Router();
const { getGeminiResponse, analyzeLegalDocument } = require('../services/gemini');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const dbService = require('../services/db.service');

/**
 * @route   POST /api/query
 * @desc    Get AI legal advice or simulated courtroom debate
 * @access  Optional Auth
 */
router.post('/query', optionalAuthMiddleware, async (req, res) => {
  const requestId = 'REQ-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  try {
    const { message, messages, mode = 'normal', language = 'English', conversationId } = req.body;
    
    // Validate request
    if ((!message || typeof message !== 'string' || message.trim() === '') && (!messages || !Array.isArray(messages))) {
      return res.status(400).json({ error: 'A valid message string or messages array is required' });
    }

    const inputMsg = message ? message.trim() : messages[messages.length - 1]?.content;
    console.log(`[HTTP Request] ID: ${requestId} | Method: POST | Path: /api/query | Mode: ${mode} | Language: ${language} | ConvId: ${conversationId || 'New'}`);
    console.log(`[HTTP Request Payload] ID: ${requestId} | Body: ${JSON.stringify(req.body)}`);

    // Fetch response from Gemini
    const text = await getGeminiResponse({ 
      message: message ? message.trim() : undefined, 
      messages, 
      mode, 
      language,
      requestId,
      req
    });

    let savedConversationId = conversationId;
    let savedCourtroomId = null;

    // Database Persistence (only if authenticated)
    if (req.user) {
      try {
        if (mode === 'normal') {
          if (conversationId) {
            // Append to existing conversation
            const conv = await dbService.saveConversation(req.user.id, {
              messages: [
                { sender: 'user', content: inputMsg },
                { sender: 'ai', content: text }
              ],
              conversationId
            });
            if (conv) savedConversationId = conv._id || conv.id;
          } else {
            // Create a new conversation
            const title = inputMsg.length > 50 ? inputMsg.substring(0, 47) + '...' : inputMsg;
            const conv = await dbService.saveConversation(req.user.id, {
              messages: [
                { sender: 'user', content: inputMsg },
                { sender: 'ai', content: text }
              ],
              title,
              conversationId: null
            });
            if (conv) savedConversationId = conv._id || conv.id;
          }
        } else if (mode === 'courtroom') {
          // Parse debate arguments and verdict to persist structured simulation
          const debateBlocks = [];
          const lines = text.split('\n');
          let currentBlock = null;

          for (let line of lines) {
            const lowerLine = line.toLowerCase().trim();
            let isHeader = false;
            let role = '';
            if (lowerLine.includes("petitioner counsel") && lowerLine.includes("rebuttal")) {
              isHeader = true; role = 'lawyer-user-rebuttal';
            } else if (lowerLine.includes("respondent counsel") && lowerLine.includes("final")) {
              isHeader = true; role = 'lawyer-defender-final';
            } else if (lowerLine.includes("petitioner counsel")) {
              isHeader = true; role = 'lawyer-user';
            } else if (lowerLine.includes("respondent counsel")) {
              isHeader = true; role = 'lawyer-defender';
            } else if (lowerLine.includes("final judgment")) {
              isHeader = true; role = 'final-verdict';
            }
            if (isHeader) {
              if (currentBlock) {
                debateBlocks.push(currentBlock);
              }
              currentBlock = { role: role, title: line.trim(), content: '' };
            } else if (currentBlock) {
              currentBlock.content += line + '\n';
            }
          }
          if (currentBlock) {
            debateBlocks.push(currentBlock);
          }

          // Separate final verdict text
          const verdictBlock = debateBlocks.find(b => b.role === 'final-verdict');
          const verdictText = verdictBlock ? verdictBlock.content.trim() : 'Verdict pending';

          const session = await dbService.saveCourtroomSession(req.user.id, {
            caseFacts: inputMsg,
            arguments: debateBlocks.filter(b => b.role !== 'final-verdict').map(b => ({
              role: b.role,
              title: b.title,
              content: b.content.trim()
            })),
            verdict: verdictText
          });
          if (session) savedCourtroomId = session._id || session.id;
        }
      } catch (dbError) {
        console.warn('Persistence warning:', dbError.message);
      }
    }

    res.json({ 
      answer: text, 
      conversationId: savedConversationId,
      courtroomId: savedCourtroomId 
    });

  } catch (error) {
    console.error(`[HTTP Request Error] ID: ${requestId} | Error: ${error.message}`);
    console.error(`[HTTP Request Stack] ID: ${requestId} | Stack:`, error.stack);

    let userFriendlyMessage = 'Failed to analyze case. Please try again.';
    const errMsg = (error.message || '').toLowerCase();
    
    if (!process.env.GEMINI_API_KEY) {
      userFriendlyMessage = 'Gemini API key is missing on the server. Please configure GEMINI_API_KEY in the environment.';
    } else if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted') || errMsg.includes('limit')) {
      userFriendlyMessage = 'Gemini API quota exceeded. The free tier limit has been reached. Please try again later.';
    } else if (errMsg.includes('timeout') || errMsg.includes('timed out') || error.name === 'AbortError') {
      userFriendlyMessage = 'Request timed out. The legal AI is currently taking longer than expected. Please try again.';
    } else if (errMsg.includes('fetch') || errMsg.includes('econnrefused') || errMsg.includes('network') || errMsg.includes('unreachable')) {
      userFriendlyMessage = 'Network connection failed or Gemini API is unreachable. Please check your internet connection.';
    } else if (errMsg.includes('empty') || errMsg.includes('invalid') || errMsg.includes('json') || errMsg.includes('parse')) {
      userFriendlyMessage = 'Invalid API response received from the AI model. Please refine your query and try again.';
    } else {
      userFriendlyMessage = error.message || 'Internal server error.';
    }

    res.status(error.status || 500).json({ error: userFriendlyMessage });
  }
});

/**
 * @route   POST /api/analyze-document
 * @desc    Analyze uploaded/pasted document text
 * @access  Optional Auth
 */
router.post('/analyze-document', optionalAuthMiddleware, async (req, res) => {
  const requestId = 'REQ-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  try {
    const { filename, content } = req.body;

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Document text content is required' });
    }

    const docName = filename || 'unnamed_document.txt';
    console.log(`[HTTP Request] ID: ${requestId} | Method: POST | Path: /api/analyze-document | Filename: ${docName}`);
    console.log(`[HTTP Request Payload] ID: ${requestId} | Content Length: ${content.length} chars`);
    
    const analysis = await analyzeLegalDocument(content, requestId, req);

    let docId = null;

    if (req.user) {
      try {
        const doc = await dbService.saveDocument(req.user.id, {
          filename: docName,
          summary: analysis.summary,
          risks: analysis.risks,
          clauses: analysis.clauses
        });
        if (doc) docId = doc._id || doc.id;
      } catch (dbError) {
        console.warn('Document persistence warning:', dbError.message);
      }
    }

    res.json({
      id: docId,
      filename: docName,
      analysis
    });

  } catch (error) {
    console.error(`[HTTP Request Error] ID: ${requestId} | Error: ${error.message}`);
    console.error(`[HTTP Request Stack] ID: ${requestId} | Stack:`, error.stack);

    let userFriendlyMessage = 'Failed to analyze document. Please check API key status.';
    const errMsg = (error.message || '').toLowerCase();
    
    if (!process.env.GEMINI_API_KEY) {
      userFriendlyMessage = 'Gemini API key is missing on the server. Please configure GEMINI_API_KEY in the environment.';
    } else if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted') || errMsg.includes('limit')) {
      userFriendlyMessage = 'Gemini API quota exceeded. The free tier limit has been reached. Please try again later.';
    } else if (errMsg.includes('timeout') || errMsg.includes('timed out') || error.name === 'AbortError') {
      userFriendlyMessage = 'Document analysis request timed out. Please try again.';
    } else if (errMsg.includes('fetch') || errMsg.includes('econnrefused') || errMsg.includes('network') || errMsg.includes('unreachable')) {
      userFriendlyMessage = 'Network connection failed or Gemini API is unreachable. Please check your internet connection.';
    } else if (errMsg.includes('empty') || errMsg.includes('invalid') || errMsg.includes('json') || errMsg.includes('parse')) {
      userFriendlyMessage = 'Invalid API response received from the AI model. Please check contract formatting and try again.';
    } else {
      userFriendlyMessage = error.message || 'Internal server error.';
    }

    res.status(error.status || 500).json({ error: userFriendlyMessage });
  }
});

/**
 * @route   GET /api/history/conversations
 * @desc    Get user conversations list
 * @access  Mandatory Auth
 */
router.get('/history/conversations', authMiddleware, async (req, res) => {
  try {
    const conversations = await dbService.getUserConversations(req.user.id);
    res.json(conversations);
  } catch (error) {
    console.error('Fetch conversation list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

/**
 * @route   GET /api/history/conversations/:id
 * @desc    Get full conversation messages
 * @access  Mandatory Auth
 */
router.get('/history/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await dbService.getConversationById(req.params.id, req.user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation history record not found' });
    }
    res.json(conversation);
  } catch (error) {
    console.error('Fetch conversation details error:', error.message);
    res.status(500).json({ error: 'Failed to fetch conversation details' });
  }
});

/**
 * @route   DELETE /api/history/conversations/:id
 * @desc    Delete a conversation
 * @access  Mandatory Auth
 */
router.delete('/history/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const result = await dbService.deleteConversationById(req.params.id, req.user.id);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Conversation record not found or unauthorized' });
    }
    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error.message);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * @route   GET /api/history/courtroom
 * @desc    Get user courtroom sessions list
 * @access  Mandatory Auth
 */
router.get('/history/courtroom', authMiddleware, async (req, res) => {
  try {
    const sessions = await dbService.getUserCourtroomSessions(req.user.id);
    res.json(sessions);
  } catch (error) {
    console.error('Fetch courtroom session list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch courtroom sessions' });
  }
});

/**
 * @route   GET /api/history/courtroom/:id
 * @desc    Get full courtroom session details
 * @access  Mandatory Auth
 */
router.get('/history/courtroom/:id', authMiddleware, async (req, res) => {
  try {
    const session = await dbService.getCourtroomSessionById(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Courtroom session record not found' });
    }
    res.json(session);
  } catch (error) {
    console.error('Fetch courtroom session details error:', error.message);
    res.status(500).json({ error: 'Failed to fetch courtroom session details' });
  }
});

/**
 * @route   GET /api/history/documents
 * @desc    Get user analyzed documents list
 * @access  Mandatory Auth
 */
router.get('/history/documents', authMiddleware, async (req, res) => {
  try {
    const docs = await dbService.getUserDocuments(req.user.id);
    res.json(docs);
  } catch (error) {
    console.error('Fetch documents list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch document history' });
  }
});

/**
 * @route   GET /api/history/documents/:id
 * @desc    Get specific document details
 * @access  Mandatory Auth
 */
router.get('/history/documents/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await dbService.getDocumentById(req.params.id, req.user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document record not found' });
    }
    res.json(doc);
  } catch (error) {
    console.error('Fetch document details error:', error.message);
    res.status(500).json({ error: 'Failed to fetch document details' });
  }
});

module.exports = router;
