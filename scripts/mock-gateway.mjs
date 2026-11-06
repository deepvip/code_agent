#!/usr/bin/env node
/**
 * 本地模拟模型网关（仅用于自检，不参与生产）。
 * 用法：
 *   node scripts/mock-gateway.mjs            # 默认 8787 端口
 *   node scripts/mock-gateway.mjs 9999
 *
 * 然后另开终端：
 *   $env:AERO_AI_BASE_URL = "http://127.0.0.1:8787/v1"
 *   $env:AERO_AI_API_KEY  = "sk-local"
 *   opencode run --agent build "ping"
 *
 * 抓到的请求体写在 tmp/last-request.json
 */
import { mkdirSync, writeFileSync } from "node:fs"
import http from "node:http"
import path from "node:path"
import process from "node:process"

const port = Number(process.argv[2] ?? 8787)
const root = path.resolve(import.meta.dirname, "..")
const outDir = path.join(root, "tmp")
const outFile = path.join(outDir, "last-request.json")

function send(res, status, body, contentType = "application/json") {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const chunks = []
  req.on("data", (chunk) => chunks.push(chunk))
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8")

    if (req.method === "GET" && req.url?.endsWith("/models")) {
      return send(res, 200, JSON.stringify({ object: "list", data: [{ id: "main" }, { id: "fast" }] }))
    }

    if (req.method !== "POST") return send(res, 404, JSON.stringify({ error: "not found" }))

    mkdirSync(outDir, { recursive: true })
    let parsed = body
    try {
      parsed = JSON.parse(body)
    } catch {
      // 原样保存
    }
    writeFileSync(
      outFile,
      JSON.stringify({ url: req.url, headers: req.headers, body: parsed }, null, 2),
      "utf8",
    )
    console.log(`收到请求：${req.method} ${req.url} -> ${outFile}`)

    if (req.url?.includes("/chat/completions")) {
      const chunk = (delta, finish) => {
        const payload = {
          id: "mock-1",
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "aero-main",
          choices: [{ index: 0, delta, finish_reason: finish }],
        }
        return `data: ${JSON.stringify(payload)}\n\n`
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })
      res.write(chunk({ role: "assistant", content: "pong" }, null))
      res.write(
        `data: ${JSON.stringify({
          id: "mock-1",
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "aero-main",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
        })}\n\n`,
      )
      res.write("data: [DONE]\n\n")
      return res.end()
    }

    return send(res, 404, JSON.stringify({ error: "unsupported endpoint" }))
  })
})

server.listen(port, "127.0.0.1", () => {
  console.log(`模拟网关已启动：http://127.0.0.1:${port}/v1`)
  console.log(`请求将写入：${outFile}`)
  console.log("按 Ctrl+C 退出")
})
