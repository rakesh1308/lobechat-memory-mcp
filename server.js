import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const MEMORY_API_BASE = process.env.MEMORY_API_BASE;
const PORT = process.env.PORT || 3000;

if (!MEMORY_API_BASE) {
  console.error("❌ Missing MEMORY_API_BASE");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// Create MCP server
const mcpServer = new Server(
  {
    name: "lobechat-memory",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
mcpServer.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "get_user_memories",
        description: "Get recent memories for a user",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "User ID to get memories for",
            },
            limit: {
              type: "number",
              description: "Max memories to return (default 20)",
              default: 20,
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "search_memories",
        description: "Search user memories by keyword",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "User ID",
            },
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["user_id", "query"],
        },
      },
      {
        name: "get_memory_summary",
        description: "Get formatted summary of user's memories",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "User ID",
            },
          },
          required: ["user_id"],
        },
      },
    ],
  };
});

// Implement tool calls
mcpServer.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_user_memories") {
      const { user_id, limit = 20 } = args;
      const response = await fetch(
        `${MEMORY_API_BASE}/api/recent?user_id=${user_id}&limit=${limit}`
      );
      const data = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.memories, null, 2),
          },
        ],
      };
    }

    if (name === "search_memories") {
      const { user_id, query } = args;
      const response = await fetch(
        `${MEMORY_API_BASE}/api/search?q=${encodeURIComponent(query)}&user_id=${user_id}`
      );
      const data = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.memories, null, 2),
          },
        ],
      };
    }

    if (name === "get_memory_summary") {
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

      const summary = `User Memory Summary for ${user_id}:

${Object.entries(byCategory)
  .map(([cat, facts]) => 
    `${cat.toUpperCase()}:\n${facts.map(f => `- ${f}`).join('\n')}`
  )
  .join('\n\n')}

Total memories: ${data.count || 0}`;

      return {
        content: [
          {
            type: "text",
            text: summary,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "lobechat-memory-mcp",
    transport: "SSE",
    memoryApi: MEMORY_API_BASE,
  });
});

// SSE endpoint for MCP
app.get("/sse", async (req, res) => {
  console.log("📡 New SSE connection");
  
  const transport = new SSEServerTransport("/message", res);
  await mcpServer.connect(transport);
  
  // Handle client disconnect
  req.on("close", () => {
    console.log("📡 SSE connection closed");
  });
});

// Message endpoint for MCP
app.post("/message", async (req, res) => {
  // This is handled by the SSE transport
  res.status(200).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Remote MCP Server running on port ${PORT}`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`💾 Memory API: ${MEMORY_API_BASE}`);
});
