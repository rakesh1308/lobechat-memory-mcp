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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'lobechat-memory-mcp',
    protocol: 'MCP 1.0'
  });
});

// MCP Manifest
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'lobechat-memory',
    version: '1.0.0',
    description: 'Memory system for LobeChat',
    protocol: 'mcp',
    tools: [
      {
        name: 'get_memory_summary',
        description: 'Get formatted summary of user memories'
      },
      {
        name: 'search_memories',
        description: 'Search user memories by keyword'
      },
      {
        name: 'get_user_memories',
        description: 'Get recent user memories'
      }
    ]
  });
});

// Simple HTTP endpoints (not SSE - easier for LobeChat)
app.post('/tools/list', async (req, res) => {
  console.log('📋 Tools list requested');
  
  res.json({
    tools: [
      {
        name: 'get_memory_summary',
        description: 'Get formatted summary of all user memories organized by category. Use this to understand user context.',
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
      },
      {
        name: 'search_memories',
        description: 'Search user memories by keyword',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              description: 'User ID'
            },
            query: {
              type: 'string',
              description: 'Search query'
            }
          },
          required: ['user_id', 'query']
        }
      },
      {
        name: 'get_user_memories',
        description: 'Get recent memories for a user',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              description: 'User ID'
            },
            limit: {
              type: 'number',
              description: 'Max memories (default 20)',
              default: 20
            }
          },
          required: ['user_id']
        }
      }
    ]
  });
});

app.post('/tools/call', async (req, res) => {
  console.log('🔧 Tool call:', JSON.stringify(req.body, null, 2));
  
  const { name, arguments: args } = req.body;

  try {
    let result;

    if (name === 'get_memory_summary') {
      const { user_id } = args;
      const response = await fetch(
        `${MEMORY_API_BASE}/api/recent?user_id=${user_id}&limit=50`
      );
      const data = await response.json();

      const byCategory = {};
      for (const mem of data.memories || []) {
        if (!byCategory[mem.category]) {
          byCategory[mem.category] = [];
        }
        byCategory[mem.category].push(mem.content);
      }

      const summary = `User Memory Summary:\n\n${Object.entries(byCategory)
        .map(([cat, facts]) => `${cat.toUpperCase()}:\n${facts.map(f => `- ${f}`).join('\n')}`)
        .join('\n\n')}\n\nTotal: ${data.count || 0} memories`;

      result = {
        content: summary
      };
    }

    else if (name === 'search_memories') {
      const { user_id, query } = args;
      const response = await fetch(
        `${MEMORY_API_BASE}/api/search?q=${encodeURIComponent(query)}&user_id=${user_id}`
      );
      const data = await response.json();

      result = {
        content: `Found ${data.count || 0} memories:\n\n${(data.memories || [])
          .map(m => `- [${m.category}] ${m.content}`)
          .join('\n')}`
      };
    }

    else if (name === 'get_user_memories') {
      const { user_id, limit = 20 } = args;
      const response = await fetch(
        `${MEMORY_API_BASE}/api/recent?user_id=${user_id}&limit=${limit}`
      );
      const data = await response.json();

      result = {
        content: `Recent ${data.count || 0} memories:\n\n${(data.memories || [])
          .map(m => `- [${m.category}] ${m.content}`)
          .join('\n')}`
      };
    }

    else {
      throw new Error(`Unknown tool: ${name}`);
    }

    console.log('✅ Tool result:', result.content.substring(0, 100) + '...');
    res.json(result);

  } catch (error) {
    console.error('❌ Tool error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Fallback for LobeChat's custom plugin format
app.post('/api/tools', async (req, res) => {
  console.log('🔧 Custom tool call:', JSON.stringify(req.body, null, 2));
  
  const { action, params } = req.body;
  
  try {
    let result;
    
    if (action === 'get_memory_summary' || action === 'getMemorySummary') {
      const { user_id, userId } = params;
      const uid = user_id || userId;
      
      const response = await fetch(
        `${MEMORY_API_BASE}/api/recent?user_id=${uid}&limit=50`
      );
      const data = await response.json();

      const byCategory = {};
      for (const mem of data.memories || []) {
        if (!byCategory[mem.category]) {
          byCategory[mem.category] = [];
        }
        byCategory[mem.category].push(mem.content);
      }

      result = Object.entries(byCategory)
        .map(([cat, facts]) => `${cat.toUpperCase()}:\n${facts.map(f => `- ${f}`).join('\n')}`)
        .join('\n\n');
    }
    
    res.json({
      success: true,
      data: result
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
  console.log(`✅ MCP Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`📄 Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`📋 Tools list: POST http://localhost:${PORT}/tools/list`);
  console.log(`🔧 Call tool: POST http://localhost:${PORT}/tools/call`);
});
