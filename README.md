# SQLite MCP Server

A Model Context Protocol (MCP) server for SQLite database operations, specifically configured for the Northwind database. The server runs on HTTP port 8081 and provides both MCP and REST API interfaces.

## Features

- Execute SQL queries on SQLite databases
- List all tables in the database
- Get table schema and structure information
- Get detailed table information including row counts, foreign keys, and indexes
- Safe error handling and connection management
- HTTP transport on port 8081
- REST API endpoint for direct database queries

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

### Starting the Server

```bash
npm start
```

The server will start on `http://localhost:8081`

Or for development with auto-restart:
```bash
npm run dev
```

### REST API

#### Query Database
Execute SQL queries via REST API:

**Endpoint:** `POST /query`

**Request Body:**
```json
{
  "query": "SELECT * FROM customers LIMIT 5",
  "database": undefined
}
```

**Response (SELECT query):**
```json
{
  "success": true,
  "data": [
    {
      "CustomerID": "ALFKI",
      "CompanyName": "Alfreds Futterkiste",
      "ContactName": "Maria Anders"
    }
  ],
  "rowCount": 1
}
```

**Response (INSERT/UPDATE/DELETE query):**
```json
{
  "success": true,
  "data": {
    "changes": 1,
    "lastID": 123
  },
  "message": "Query executed successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message"
}
```

### MCP Tools

The MCP server provides the following tools:

#### 1. `query`
Execute a SQL query on the SQLite database.

**Parameters:**
- `sql` (string, required): The SQL query to execute

**Example:**
```sql
SELECT * FROM customers LIMIT 5
```

#### 2. `list_tables`
List all tables in the database.

**Parameters:** None

#### 3. `describe_table`
Get the schema/structure of a specific table.

**Parameters:**
- `table_name` (string, required): Name of the table to describe

#### 4. `get_table_info`
Get detailed information about a table including column details, row count, foreign keys, and indexes.

**Parameters:**
- `table_name` (string, required): Name of the table to get info for

## Database

The server is configured to use the `northwind.db` SQLite database file located in the same directory as the server.

## Configuration

The server configuration is set in `index.js`:
```javascript
const PORT = 8081;
const DB_PATH = path.join(__dirname, "northwind.db");
```

To use a different port or database, modify these values in the `index.js` file.

## MCP Client Configuration

To use this server with an MCP client, add the following configuration:

```json
{
  "mcpServers": {
    "sqlite": {
      "url": "http://localhost:8081/"
    }
  }
}
```

## Server Endpoints

- **Base URL**: `http://localhost:8081`
- **Server Info**: `GET http://localhost:8081/` - Returns server metadata
- **MCP Endpoint**: `GET http://localhost:8081/` (with Accept: text/event-stream) - Establishes SSE connection
- **REST Query**: `POST http://localhost:8081/query` - Execute SQL queries via REST API

## Example Usage

### Using curl to query the database:

```bash
curl -X POST http://localhost:8081/query \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM customers LIMIT 3"}'
```

### Using JavaScript fetch:

```javascript
const response = await fetch('http://localhost:8081/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'SELECT * FROM products WHERE CategoryID = 1',
    database: undefined
  })
});

const result = await response.json();
console.log(result);
```

## Error Handling

The server includes comprehensive error handling:
- Database connection errors
- SQL syntax errors
- Invalid table names
- HTTP transport errors
- JSON parsing errors
- Graceful shutdown on SIGINT

## Dependencies

- `@modelcontextprotocol/sdk`: MCP SDK for server implementation
- `sqlite3`: SQLite database driver for Node.js

## License

MIT 