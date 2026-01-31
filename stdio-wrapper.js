#!/usr/bin/env node
/**
 * 超协体 MCP Stdio Wrapper
 * 将 stdio（标准输入输出）转换为 HTTP 调用
 * 用于让 OpenCode 通过本地模式连接到超协体 MCP 服务器
 */

const http = require('http');
const readline = require('readline');

const MCP_SERVER_URL = 'http://localhost:3000';

// 创建 readline 接口读取 stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// 处理 JSON-RPC 请求
async function handleJsonRpcRequest(request) {
  try {
    const { method, params, id } = request;

    if (method === 'initialize') {
      // 返回服务器能力
      return {
        jsonrpc: '2.0',
        id: id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: '超协体协作中枢',
            version: '1.0.0'
          }
        }
      };
    }

    if (method === 'tools/list') {
      // 获取工具列表
      const manifest = await httpGet('/mcp/manifest');
      return {
        jsonrpc: '2.0',
        id: id,
        result: {
          tools: manifest.tools
        }
      };
    }

    if (method === 'tools/call') {
      // 调用工具
      const { name, arguments: args } = params;
      const result = await httpPost('/mcp/tools/call', { name, arguments: args });

      return {
        jsonrpc: '2.0',
        id: id,
        result: result
      };
    }

    // 未知方法
    return {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    };

  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: error.message
      }
    };
  }
}

// HTTP GET 请求
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${MCP_SERVER_URL}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    }).on('error', reject);
  });
}

// HTTP POST 请求
function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const jsonData = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(jsonData, 'utf8')
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(jsonData);
    req.end();
  });
}

// 监听 stdin 输入
rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    const response = await handleJsonRpcRequest(request);

    // 输出到 stdout（OpenCode 从这里读取）
    console.log(JSON.stringify(response));

  } catch (error) {
    console.error(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: `Parse error: ${error.message}`
      }
    }));
  }
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32603,
      message: `Internal error: ${error.message}`
    }
  }));
  process.exit(1);
});

// 启动日志（发送到 stderr，不影响 stdout）
console.error('[Stdio Wrapper] 超协体 MCP Stdio Wrapper 已启动');
console.error(`[Stdio Wrapper] 连接到: ${MCP_SERVER_URL}`);
