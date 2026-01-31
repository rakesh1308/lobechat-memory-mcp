import {
  Server,
  Tool,
  TextContent,
} from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";

const MEMORY_API_BASE = process.env.MEMORY_API_BASE;

if (!MEMORY_API_BASE) {
  console.error("❌ Missing MEMORY_API_BASE env var");
  process.exit(1);
}

const server = new Server({
  name: "lobechat-memory-mcp",
  version: "1.0.0",
});

// Define available tools
server.setRequestHandler(Tool.ListRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_user_memories",
        description: "Get all memories for current user",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "User ID to get memories for"
            },
            limit: {
              type: "number",
              description: "Max memories to return (default 20)"
            }
          },
          required: ["user_id"]
        }
      },
      {
        name: "search_memories",
        description: "Search user memories by keyword",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "User ID"
            },
            query: {
              type: "string",
              description: "Search query"
            }
          },
          required: ["user_id", "query"]
        }
      },
      {
        name: "get_memory_summary",
        description: "Get a summary of user's preferences and facts",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "User ID"
            }
          },
          required: ["user_id"]
        }
      }
    ]
  };
});

// Implement tools
server.setRequestHandler(Tool.CallRequestSchema, async (request) => {
  const { name, arguments: args } = request;

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
            text: JSON.stringify(data.memories, null, 2)
          }
        ]
      };
    }

    if (name === "search_memories") {
      const { user_id, query } = args;
      const response = await fetch(
        `${MEMORY_API_BASE}/api/search?q=${query}&user_id=${user_id}`
      );
      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.memories, null, 2)
          }
        ]
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
      for (const mem of data.memories) {
        if (!byCategory[mem.category]) {
          byCategory[mem.category] = [];
        }
        byCategory[mem.category].push(mem.content);
      }

      const summary = `
User Memory Summary for ${user_id}:

${Object.entries(byCategory)
  .map(([cat, facts]) => `${cat.toUpperCase()}:\n${facts.map(f => `- ${f}`).join('\n')}`)
  .join('\n\n')}

Total memories: ${data.count}
      `;

      return {
        content: [
          {
            type: "text",
            text: summary
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`
        }
      ],
      isError: true
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.log("🚀 MCP Memory Server running");
