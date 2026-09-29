// Preload (NODE_OPTIONS=--require): logs EVERY outgoing HTTP request from this Node process through BOTH stacks,
// using Node's official diagnostics channels, so nothing can slip past:
//   - node:http / node:https clients (axios in Node)  -> http.client.request.start / http.client.response.finish
//   - undici / global fetch                            -> undici:request:create / undici:request:headers
// Logs method + origin + path only (query stripped). Never headers or bodies, so no credential can leak.
const dc = require("node:diagnostics_channel");
const t0 = Date.now();
const log = (s) => process.stderr.write(`[trace +${((Date.now() - t0) / 1000).toFixed(1)}s pid${process.pid}] ${s}\n`);
const clean = (p) => String(p ?? "").replace(/\?.*$/, "");

dc.subscribe("http.client.request.start", ({ request }) => {
  log(`http  -> ${request.method} ${request.protocol ?? ""}//${request.host}${clean(request.path)}`);
});
dc.subscribe("http.client.response.finish", ({ request, response }) => {
  log(`http  <- ${response.statusCode} ${request.method} ${request.host}${clean(request.path)}`);
});
dc.subscribe("undici:request:create", ({ request }) => {
  log(`fetch -> ${request.method} ${request.origin}${clean(request.path)}`);
});
dc.subscribe("undici:request:headers", ({ request, response }) => {
  log(`fetch <- ${response.statusCode} ${request.method} ${request.origin}${clean(request.path)}`);
});
log(`tracer armed (http + undici channels), argv: ${process.argv.slice(1).map((a) => a.slice(0, 40)).join(" ")}`);
