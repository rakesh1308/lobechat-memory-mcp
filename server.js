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

// Store active SSE connections
const connections = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'lobechat-memory-mcp',
    protocol: 'MCP 1.0',
    transport: 'SSE',
    connections: connections.size
  });
});

// MCP Initialize endpoint
app.post('/sse', async (req, res) => {
  console.log('📡 New MCP connection request');
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const connectionId = Date.now().toString();
  connections.set(connectionId, res);

  console.log(`✅ SSE connection established: ${connectionId}`);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialized',
    params: {}
  })}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`📡 SSE connection closed: ${connectionId}`);
    clearInterval(keepAlive);
    connections.delete(connectionId);
  });
});

// MCP Messages endpoint
app.post('/message', async (req, res) => {
  console.log('📨 MCP message received:', JSON.stringify(req.body, null, 2));

  const { jsonrpc, id, method, params } = req.body;

  try {
    let result;

    // Handle initialize
    if (method === 'initialize') {
      result = {
        protocolVersion: '1.0',
        serverInfo: {
          name: 'lobechat-memory-mcp',
          version: '1.0.0'
        },
        capabilities: {
          tools: {}
        }
      };
    }

    // Handle tools/list
    else if (method === 'tools/list') {
      result = {
        tools: [
          {
            name: 'get_user_memories',
            description: 'Get recent memories for a user. Returns list of stored facts about the user.',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'User ID to get memories for'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of memories to return (default: 20)',
                  default: 20
                }
              },
              required: ['user_id']
            }
          },
          {
            name: 'search_memories',
            description: 'Search user memories by keyword. Useful for finding specific facts.',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'User ID'
                },
                query: {
                  type: 'string',
                  description: 'Search query keyword'
                }
              },
              required: ['user_id', 'query']
            }
          },
          {
            name: 'get_memory_summary',
            description: 'Get formatted summary of all user memories organized by category. Best for understanding user context.',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'User ID'
                }
              },
              required: ['user_id']
            }
          }
        ]
      };
    }

    // Handle tools/call
    else if (method === 'tools/call') {
      const { name, arguments: args } = params;

      if (name === 'get_user_memories') {
        const { user_id, limit = 20 } = args;
        const response = await fetch(
          `${MEMORY_API_BASE}/api/recent?user_id=${user_id}&limit=${limit}`
        );
        const data = await response.json();

        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data.memories, null, 2)
            }
          ]
        };
      }

      else if (name === 'search_memories') {
        const { user_id, query } = args;
        const response = await fetch(
          `${MEMORY_API_BASE}/api/search?q=${encodeURIComponent(query)}&user_id=${user_id}`
        );
        const data = await response.json();

        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data.memories, null, 2)
            }
          ]
        };
      }

      else if (name === 'get_memory_summary') {
        const { user_id } = args;
        const response = await fetch(
          `${MEMORY_API_BASE}/api/recent?user_id=${user_id}&limit=50`
        );
        const data = await response.json();

        // Build summary
        const byCategory = {};
        for (const mem of data.memories || []) {
          if (!byCategory[mem.category]) {
            byCategory[mem.category] = [];
          }
          byCategory[mem.category].push(mem.content);
        }

        const summary = `User Memory Summary:\n\n${Object.entries(byCategory)
          .map(([cat, facts]) => `${cat.toUpperCase()}:\n${facts.map(f => `- ${f}`).join('\n')}`)
          .join('\n\n')}\n\nTotal memories: ${data.count || 0}`;

        result = {
          content: [
            {
              type: 'text',
              text: summary
            }
          ]
        };
      }

      else {
        throw new Error(`Unknown tool: ${name}`);
      }
    }

    else {
      throw new Error(`Unknown method: ${method}`);
    }

    // Send response
    res.json({
      jsonrpc: '2.0',
      id,
      result
    });

    console.log('✅ Response sent');

  } catch (error) {
    console.error('❌ Error:', error);
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// MCP Manifest (for discovery)
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'lobechat-memory-mcp',
    version: '1.0.0',
    description: 'Memory system for LobeChat with automatic fact extraction',
    protocol: 'mcp',
    transport: 'sse',
    endpoints: {
      sse: '/sse',
      message: '/message'
    },
    tools: [
      'get_user_memories',
      'search_memories', 
      'get_memory_summary'
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ MCP Server running on port ${PORT}`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`📨 Message endpoint: http://localhost:${PORT}/message`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📄 Manifest: http://localhost:${PORT}/manifest.json`);
});
