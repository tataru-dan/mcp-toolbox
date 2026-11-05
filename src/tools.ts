import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolDefs } from "./toolDefs.js";

export function registerTools(server: McpServer) {
  for (const def of toolDefs) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.zodInputShape,
        outputSchema: def.zodOutputShape,
      },
      async (args) => def.handler(args),
    );
  }
}
