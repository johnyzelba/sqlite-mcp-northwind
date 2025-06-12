#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import sqlite3 from "sqlite3";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = 8081;
const DB_PATH = path.join(__dirname, "northwind.db");

// Create server instance
const server = new Server(
  {
    name: "sqlite-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Database connection
let db;

// Store active transports
const activeTransports = new Map();

// Initialize database connection
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
        reject(err);
      } else {
        console.log("Connected to SQLite database:", DB_PATH);
        resolve();
      }
    });
  });
}

// Promisify database methods
function promisifyDb(db) {
  return {
    all: promisify(db.all.bind(db)),
    get: promisify(db.get.bind(db)),
    run: promisify(db.run.bind(db)),
  };
}

// Helper function to parse JSON body from request
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Execute database query
async function executeQuery(sql) {
  const dbPromise = promisifyDb(db);
  
  // Determine query type
  const trimmedSql = sql.trim().toLowerCase();
  const isSelect = trimmedSql.startsWith("select");
  const isPragma = trimmedSql.startsWith("pragma");
  const isShow = trimmedSql.startsWith("show") || trimmedSql.startsWith("describe") || trimmedSql.startsWith("explain");
  
  if (isSelect || isPragma || isShow) {
    // Queries that return rows
    const rows = await dbPromise.all(sql);
    return {
      success: true,
      data: rows,
      rowCount: rows.length
    };
  } else {
    // Modification queries (INSERT, UPDATE, DELETE, etc.)
    const result = await dbPromise.run(sql);
    return {
      success: true,
      data: {
        changes: result.changes || 0,
        lastID: result.lastID || null
      },
      message: "Query executed successfully"
    };
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "sql_query",
        description: "Execute a SQL query on the SQLite database",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "The SQL query to execute",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "list_tables",
        description: "List all tables in the database",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "describe_table",
        description: "Get the schema/structure of a specific table",
        inputSchema: {
          type: "object",
          properties: {
            table_name: {
              type: "string",
              description: "Name of the table to describe",
            },
          },
          required: ["table_name"],
        },
      },
      {
        name: "get_table_info",
        description: "Get detailed information about a table including column details",
        inputSchema: {
          type: "object",
          properties: {
            table_name: {
              type: "string",
              description: "Name of the table to get info for",
            },
          },
          required: ["table_name"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const dbPromise = promisifyDb(db);

  try {
    switch (name) {
      case "sql_query": {
        const { sql } = args;
        const result = await executeQuery(sql);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list_tables": {
        const tables = await dbPromise.all(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tables.map(t => t.name), null, 2),
            },
          ],
        };
      }

      case "describe_table": {
        const { table_name } = args;
        const schema = await dbPromise.all(`PRAGMA table_info(${table_name})`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      }

      case "get_table_info": {
        const { table_name } = args;
        
        // Get table schema
        const schema = await dbPromise.all(`PRAGMA table_info(${table_name})`);
        
        // Get row count
        const countResult = await dbPromise.get(`SELECT COUNT(*) as count FROM ${table_name}`);
        
        // Get foreign keys
        const foreignKeys = await dbPromise.all(`PRAGMA foreign_key_list(${table_name})`);
        
        // Get indexes
        const indexes = await dbPromise.all(`PRAGMA index_list(${table_name})`);
        
        const tableInfo = {
          table_name,
          row_count: countResult.count,
          columns: schema,
          foreign_keys: foreignKeys,
          indexes: indexes
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tableInfo, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
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

// Start the server
async function main() {
  try {
    await initDatabase();
    
    // Create HTTP server
    const httpServer = http.createServer(async (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      // Handle REST API query endpoint
      if (req.url === '/query' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const { query, database } = body;
          
          if (!query) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: 'Query is required' 
            }));
            return;
          }
          
          // Note: database parameter is currently ignored, using default DB
          const result = await executeQuery(query);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: error.message 
          }));
        }
        return;
      }
      
      if (req.url === '/' && req.method === 'GET') {
        // Check if this is an SSE connection request
        const acceptHeader = req.headers.accept;
        if (acceptHeader && acceptHeader.includes('text/event-stream')) {
          // Handle SSE connection
          const transport = new SSEServerTransport("/", res);
          
          // Store the transport
          activeTransports.set(transport.sessionId, transport);
          
          // Connect the server to this transport
          await server.connect(transport);
          
          // Start the SSE connection
          await transport.start();
          
          // Clean up when connection closes
          transport.onclose = () => {
            activeTransports.delete(transport.sessionId);
          };
          
          return;
        } else {
          // Return server info for regular GET requests
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            name: "sqlite-mcp-server",
            version: "1.0.0",
            description: "SQLite MCP Server",
            endpoints: {
              mcp: "/",
              query: "/query"
            }
          }));
          return;
        }
      }
      
      // Handle POST messages for MCP
      if (req.url?.startsWith('/') && req.method === 'POST') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const sessionId = url.searchParams.get('sessionId');
        
        if (sessionId && activeTransports.has(sessionId)) {
          const transport = activeTransports.get(sessionId);
          await transport.handlePostMessage(req, res);
          return;
        }
      }
      
      res.writeHead(404);
      res.end('Not Found');
    });
    
    httpServer.listen(PORT, () => {
      console.log(`SQLite MCP Server running on http://localhost:${PORT}`);
      console.log(`MCP endpoint: http://localhost:${PORT}/`);
      console.log(`REST API endpoint: http://localhost:${PORT}/query`);
    });
    
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed.");
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

main().catch(console.error); 