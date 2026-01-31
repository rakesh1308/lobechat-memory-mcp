import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;
const MEMORY_API_BASE = process.env.MEMORY_API_BASE;

if (!MEMORY_API_BASE) {
  console.error("❌ Missing MEMORY_API_BASE env var");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

console.log("🚀 Memory Bridge API starting...");
console.log(`📊 Memory API: ${MEMORY_API_BASE}`);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'lobechat-memory-bridge',
    version: '1.0.0',
    memoryApi: MEMORY_API_BASE
  });
});

// Get user memories
app.get('/api/memories/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit || 20;

    console.log(`📥 Fetching memories for user: ${userId}`);

    const response = await fetch(
      `${MEMORY_API_BASE}/api/recent?user_id=${userId}&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error(`Memory API returned ${response.status}`);
    }

    const data = await response.json();
    
    res.json({
      success: true,
      userId,
      count: data.count || 0,
      memories: data.memories || []
    });

  } catch (error) {
    console.error('❌ Error fetching memories:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Search memories
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

    console.log(`🔍 Searching memories for user ${userId}: "${q}"`);

    const response = await fetch(
      `${MEMORY_API_BASE}/api/search?q=${encodeURIComponent(q)}&user_id=${userId}`
    );
    
    if (!response.ok) {
      throw new Error(`Memory API returned ${response.status}`);
    }

    const data = await response.json();
    
    res.json({
      success: true,
      userId,
      query: q,
      count: data.count || 0,
      memories: data.memories || []
    });

  } catch (error) {
    console.error('❌ Error searching memories:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get memory summary (formatted for LLM)
app.get('/api/summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit || 50;

    console.log(`📊 Generating summary for user: ${userId}`);

    const response = await fetch(
      `${MEMORY_API_BASE}/api/recent?user_id=${userId}&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error(`Memory API returned ${response.status}`);
    }

    const data = await response.json();
    const memories = data.memories || [];

    // Group by category
    const byCategory = {};
    for (const mem of memories) {
      if (!byCategory[mem.category]) {
        byCategory[mem.category] = [];
      }
      byCategory[mem.category].push(mem.content);
    }

    // Build formatted summary
    const summaryText = Object.entries(byCategory)
      .map(([cat, facts]) => {
        const categoryName = cat.toUpperCase();
        const factsList = facts.map(f => `- ${f}`).join('\n');
        return `${categoryName}:\n${factsList}`;
      })
      .join('\n\n');

    res.json({
      success: true,
      userId,
      totalMemories: memories.length,
      byCategory,
      summary: summaryText,
      formattedForLLM: `User Memory Summary:\n\n${summaryText}\n\nTotal memories: ${memories.length}`
    });

  } catch (error) {
    console.error('❌ Error generating summary:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get memories by category
app.get('/api/category/:userId/:category', async (req, res) => {
  try {
    const { userId, category } = req.params;

    console.log(`📂 Fetching ${category} memories for user: ${userId}`);

    const response = await fetch(
      `${MEMORY_API_BASE}/api/recent?user_id=${userId}&limit=100`
    );
    
    if (!response.ok) {
      throw new Error(`Memory API returned ${response.status}`);
    }

    const data = await response.json();
    const filtered = (data.memories || []).filter(m => m.category === category);
    
    res.json({
      success: true,
      userId,
      category,
      count: filtered.length,
      memories: filtered
    });

  } catch (error) {
    console.error('❌ Error fetching category memories:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Test endpoint for debugging
app.get('/api/test', async (req, res) => {
  try {
    const healthCheck = await fetch(`${MEMORY_API_BASE}/health`);
    const healthData = await healthCheck.json();
    
    res.json({
      success: true,
      bridge: 'working',
      memoryApiHealth: healthData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      bridge: 'working',
      memoryApiHealth: 'failed',
      error: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Memory Bridge API running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`📖 API Documentation:`);
  console.log(`   GET  /api/memories/:userId?limit=20`);
  console.log(`   GET  /api/search/:userId?q=query`);
  console.log(`   GET  /api/summary/:userId`);
  console.log(`   GET  /api/category/:userId/:category`);
  console.log(`   GET  /api/test`);
});
