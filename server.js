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

// CRITICAL: Enable CORS for ALL origins with all methods
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

console.log("🚀 MCP Memory Server starting...");
console.log(`📊 Memory API: ${MEMORY_API_BASE}`);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'lobechat-memory',
    version: '1.0.0',
    description: 'Memory system for LobeChat',
    endpoints: {
      manifest: '/manifest.json',
      openapi: '/openapi.json',
      health: '/health',
      api_summary: '/api/summary/:userId',
      api_search: '/api/search/:userId',
      api_memories: '/api/memories/:userId'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'lobechat-memory',
    memoryApi: MEMORY_API_BASE,
    cors: 'enabled'
  });
});

// LobeChat Plugin Manifest
app.get('/manifest.json', (req, res) => {
  // Add extra CORS headers just to be sure
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  
  const baseUrl = req.protocol + '://' + req.get('host');
  
  res.json({
    schema_version: '1.0.0',
    name_for_human: 'Memory System',
    name_for_model: 'memory',
    description_for_human: 'Access and search user memories and preferences stored across conversations',
    description_for_model: 'Memory system that stores and retrieves user facts, preferences, tech stack, and context from previous conversations. Use this to personalize responses.',
    auth: {
      type: 'none'
    },
    api: {
      type: 'openapi',
      url: `${baseUrl}/openapi.json`
    },
    logo_url: '',
    contact_email: 'support@example.com',
    legal_info_url: ''
  });
});

// OpenAPI specification
app.get('/openapi.json', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  
  const baseUrl = req.protocol + '://' + req.get('host');
  
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'Memory System API',
      version: '1.0.0',
      description: 'User memory storage and retrieval system'
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
          summary: 'Get formatted summary of all user memories',
          description: 'Returns a formatted summary of user memories organized by category (preferences, work, projects, etc.)',
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: {
                type: 'string'
              },
              description: 'User ID (e.g., kgwoo2d727xo)'
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
                      success: { type: 'boolean' },
                      summary: { type: 'string' },
                      totalMemories: { type: 'integer' }
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
          summary: 'Search user memories by keyword',
          description: 'Search through user memories using a keyword query',
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
              description: 'Search query keyword'
            }
          ],
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      query: { type: 'string' },
                      count: { type: 'integer' },
                      memories: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/memories/{userId}': {
        get: {
          operationId: 'getUserMemories',
          summary: 'Get recent user memories',
          description: 'Get a list of recent memories for a user',
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
              },
              description: 'Maximum number of memories to return'
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

// API Endpoints
app.get('/api/summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`📊 Summary for: ${userId}`);
    
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
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/search/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing query parameter: q' 
      });
    }
    
    console.log(`🔍 Search "${q}" for ${userId}`);

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
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/memories/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;
    
    console.log(`📥 Memories for ${userId} (limit: ${limit})`);

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
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Memory Server running on port ${PORT}`);
  console.log(`🌐 CORS enabled for all origins`);
  console.log(`📄 Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`📋 OpenAPI: http://localhost:${PORT}/openapi.json`);
});
