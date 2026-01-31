import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;
const MEMORY_API_BASE = process.env.MEMORY_API_BASE;

if (!MEMORY_API_BASE) {
  console.error("❌ Missing MEMORY_API_BASE");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

console.log("🚀 MCP Memory Server starting...");
console.log(`📊 Memory API: ${MEMORY_API_BASE}`);

// Root endpoint - handle LobeChat discovery
app.get('/', (req, res) => {
  res.json({
    name: 'lobechat-memory',
    version: '1.0.0',
    description: 'Memory system for LobeChat',
    endpoints: {
      manifest: '/manifest.json',
      health: '/health',
      tools_list: 'POST /tools/list',
      tools_call: 'POST /tools/call'
    }
  });
});

app.post('/', async (req, res) => {
  console.log('📨 POST to root:', JSON.stringify(req.body, null, 2));
  
  // Handle as initialize request
  res.json({
    jsonrpc: '2.0',
    id: req.body.id || 1,
    result: {
      protocolVersion: '1.0',
      serverInfo: {
        name: 'lobechat-memory',
        version: '1.0.0'
      },
      capabilities: {
        tools: {}
      }
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'lobechat-memory-mcp',
    memoryApi: MEMORY_API_BASE
  });
});

// Manifest
app.get('/manifest.json', (req, res) => {
  res.json({
    schema_version: '1.0.0',
    name_for_human: 'Memory System',
    name_for_model: 'memory',
    description_for_human: 'Access user memories and preferences',
    description_for_model: 'Memory system that stores and retrieves user facts, preferences, and context',
    auth: {
      type: 'none'
    },
    api: {
      type: 'openapi',
      url: `${req.protocol}://${req.get('host')}/openapi.json`
    },
    logo_url: '',
    contact_email: 'support@example.com',
    legal_info_url: ''
  });
});

// OpenAPI spec for LobeChat
app.get('/openapi.json', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'Memory System API',
      version: '1.0.0',
      description: 'User memory storage and retrieval'
    },
    servers: [
      {
        url: baseUrl
      }
    ],
    paths: {
      '/api/summary/{userId}': {
        get: {
          operationId: 'getMemorySummary',
          summary: 'Get memory summary for user',
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: {
                type: 'string'
              },
              description: 'User ID'
            }
          ],
          responses: {
            '200': {
              description: 'Memory summary',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      summary: {
                        type: 'string'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/search/{userId}': {
        get: {
          operationId: 'searchMemories',
          summary: 'Search user memories',
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: {
                type: 'string'
              }
            },
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: {
                type: 'string'
              },
              description: 'Search query'
            }
          ],
          responses: {
            '200': {
              description: 'Search results'
            }
          }
        }
      },
      '/api/memories/{userId}': {
        get: {
          operationId: 'getUserMemories',
          summary: 'Get recent memories',
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: {
                type: 'string'
              }
            },
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                default: 20
              }
            }
          ],
          responses: {
            '200': {
              description: 'Recent memories'
            }
          }
        }
      }
    }
  });
});

// API endpoints (for OpenAPI)
app.get('/api/summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`📊 Summary requested for: ${userId}`);
    
    const response = await fetch(
      `${MEMORY_API_BASE}/api/recent?user_id=${userId}&limit=50`
    );
    const data = await response.json();

    const byCategory = {};
    for (const mem of data.memories || []) {
      if (!byCategory[mem.category]) {
        byCategory[mem.category] = [];
      }
      byCategory[mem.category].push(mem.content);
    }

    const summary = Object.entries(byCategory)
      .map(([cat, facts]) => `${cat.toUpperCase()}:\n${facts.map(f => `- ${f}`).join('\n')}`)
      .join('\n\n');

    res.json({
      success: true,
      summary: summary || 'No memories found',
      totalMemories: data.count || 0
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/search/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { q } = req.query;
    
    console.log(`🔍 Search for "${q}" by ${userId}`);

    const response = await fetch(
      `${MEMORY_API_BASE}/api/search?q=${encodeURIComponent(q)}&user_id=${userId}`
    );
    const data = await response.json();

    res.json({
      success: true,
      query: q,
      count: data.count || 0,
      memories: data.memories || []
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/memories/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;
    
    console.log(`📥 Recent memories for ${userId}`);

    const response = await fetch(
      `${MEMORY_API_BASE}/api/recent?user_id=${userId}&limit=${limit}`
    );
    const data = await response.json();

    res.json({
      success: true,
      count: data.count || 0,
      memories: data.memories || []
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// MCP-style endpoints (backward compat)
app.post('/tools/list', (req, res) => {
  res.json({
    tools: [
      {
        name: 'getMemorySummary',
        description: 'Get formatted summary of user memories'
      },
      {
        name: 'searchMemories',
        description: 'Search user memories'
      },
      {
        name: 'getUserMemories',
        description: 'Get recent memories'
      }
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Memory Server running on port ${PORT}`);
  console.log(`🌐 Root: http://localhost:${PORT}/`);
  console.log(`📄 Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`📋 OpenAPI: http://localhost:${PORT}/openapi.json`);
  console.log(`🔧 API: /api/summary/:userId, /api/search/:userId, /api/memories/:userId`);
});
