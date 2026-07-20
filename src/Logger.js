// Session-based file logger for the main process.
// All console output (main, forked children, renderers via IPC) funnels here into
// one log file per session, rotated so at most MAX_KEEP session files are kept.
// Note: native stdout from addons loaded in the main process (e.g. win32-displayconfig)
// bypasses process.stdout.write and can't be captured here. Native output from the
// Monitors child (e.g. node-ddcci's std::cout) IS captured, via attachChild's pipes.
const fs = require('fs')
const path = require('path')
const util = require('util')
const readline = require('readline')

const MAX_KEEP = 3
const MAX_BYTES = 50 * 1024 * 1024

// Real stdout/stderr and console, captured before any console patching
const realStdoutWrite = process.stdout.write.bind(process.stdout)
const realStderrWrite = process.stderr.write.bind(process.stderr)
const origConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error
}

let stream = null
let sessionPath = null
let bytesWritten = 0
let capped = false
let disabled = false
let mirrorLogEnabled = true
let initOpts = null
const preInitBuffer = []

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "")

function timestamp() {
  const d = new Date()
  const p = (n, l = 2) => String(n).padStart(l, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

function serialize(args) {
  return args.map(a =>
    typeof a === "string" ? a :
    a instanceof Error ? (a.stack || a.message) :
    util.inspect(a, { depth: 4, maxArrayLength: 50, breakLength: Infinity })
  ).join(" ")
}

function formatLine(tag, level, args) {
  const lvl = (level === "warn" || level === "error") ? ":" + level.toUpperCase().slice(0, 3) : ""
  return `[${timestamp()}] [${tag}${lvl}] ${stripAnsi(serialize(args))}\r\n`
}

function appendLine(line) {
  if (capped || disabled) return;
  if (!stream) {
    preInitBuffer.push(line)
    return;
  }
  bytesWritten += Buffer.byteLength(line)
  if (bytesWritten > MAX_BYTES) {
    capped = true
    stream.write(`[${timestamp()}] [LOGGER] Log size cap reached (${MAX_BYTES} bytes); file logging stopped for this session.\r\n`)
    return;
  }
  stream.write(line)
}

function writeLog(tag, level, ...args) {
  appendLine(formatLine(tag, level, args))
}

// Synchronous write for fatal errors, where the process may die before the stream flushes
function writeLogSync(tag, level, ...args) {
  const line = formatLine(tag, level, args)
  if (capped || disabled || !sessionPath) return;
  try {
    fs.appendFileSync(sessionPath, line)
  } catch (e) { }
}

// Open a session log file. When enabled is false, no file is created or rotated
// and all subsequent writes are dropped; console output is unaffected either way.
function initMainLogger({ dir, isDev = false, enabled = true } = {}) {
  initOpts = { dir, isDev }
  if (!enabled) {
    disabled = true
    preInitBuffer.length = 0
    return;
  }
  disabled = false
  capped = false
  bytesWritten = 0
  const logDir = path.join(dir, "logs")
  const suffix = isDev ? "-dev" : ""
  try {
    fs.mkdirSync(logDir, { recursive: true })

    // Dev and non-dev sessions rotate as separate pools (like settings-dev.json)
    const pattern = isDev ? /^session-.*-dev\.log$/ : /^session-(?!.*-dev\.log).*\.log$/
    const existing = fs.readdirSync(logDir).filter(f => pattern.test(f)).sort()
    for (const old of existing.slice(0, Math.max(0, existing.length - (MAX_KEEP - 1)))) {
      try { fs.unlinkSync(path.join(logDir, old)) } catch (e) { }
    }

    // Zero-padded so name sort == chronological sort; PID guards same-second collisions
    const d = new Date()
    const p = (n, l = 2) => String(n).padStart(l, "0")
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${process.pid}`
    sessionPath = path.join(logDir, `session-${stamp}${suffix}.log`)
    stream = fs.createWriteStream(sessionPath, { flags: "a" })
    stream.on("error", () => { stream = null; capped = true })
  } catch (e) {
    // File logging unavailable (permissions, disk); console keeps working
    realStderrWrite(`Logger init failed: ${e}\r\n`)
    capped = true
    return;
  }
  for (const line of preInitBuffer.splice(0)) appendLine(line)
}

function patchConsole({ tag = "MAIN", mirrorLog = true } = {}) {
  mirrorLogEnabled = mirrorLog
  for (const level of ["log", "info", "debug"]) {
    console[level] = (...args) => {
      writeLog(tag, level, ...args)
      if (mirrorLog) origConsole[level](...args)
    }
  }
  // warn/error always reach the console, matching pre-existing behavior
  for (const level of ["warn", "error"]) {
    console[level] = (...args) => {
      writeLog(tag, level, ...args)
      origConsole[level](...args)
    }
  }
}

// Log on behalf of another context (e.g. renderer logs arriving over IPC),
// mirroring to the console under the same rules as console.log
function logAs(tag, ...args) {
  writeLog(tag, "log", ...args)
  if (mirrorLogEnabled) origConsole.log(...args)
}

// Pipe a forked child's stdout/stderr (fork with silent: true) into the log,
// re-emitting to the real stdout/stderr so console mode looks unchanged.
// This captures native output (e.g. node-ddcci's std::cout), which JS-level
// console patching inside the child cannot see.
function attachChild(child, tag) {
  const attach = (input, level, mirror) => {
    if (!input) return;
    const rl = readline.createInterface({ input, crlfDelay: Infinity })
    rl.on("line", line => {
      writeLog(tag, level, line)
      mirror(line + "\n")
    })
    input.on("error", () => { })
  }
  attach(child.stdout, "log", realStdoutWrite)
  attach(child.stderr, "error", realStderrWrite)
  child.on("exit", (code, signal) => writeLog(tag, "log", `Child exited (code=${code}, signal=${signal})`))
  child.on("error", err => writeLog(tag, "error", "Child error:", err))
}

function getSessionLogPath() { return sessionPath }

function isLoggingEnabled() { return !disabled }

// Turn file logging on/off at runtime (from the settings toggle). Enabling starts
// a fresh session file; disabling stops writing and closes the current one.
// Console output is never affected. No-op before initMainLogger has run.
function setLoggingEnabled(enabled) {
  if (!initOpts) return;
  if (enabled) {
    if (!disabled && stream) return; // already on
    initMainLogger({ ...initOpts, enabled: true })
    writeLog("MAIN", "log", "Logging enabled by user.")
  } else {
    if (disabled) return; // already off
    writeLog("MAIN", "log", "Logging disabled by user.")
    closeLogger()
    stream = null
    disabled = true
  }
}

function closeLogger() {
  try { stream?.end() } catch (e) { }
}

module.exports = {
  initMainLogger,
  writeLog,
  writeLogSync,
  logAs,
  patchConsole,
  attachChild,
  getSessionLogPath,
  isLoggingEnabled,
  setLoggingEnabled,
  closeLogger
}
