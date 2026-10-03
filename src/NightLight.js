// Windows "Night Light" (blue light reduction) controller.
//
// Windows does not expose an API for Night Light, so its state and settings
// live in two CloudStore registry values as Bond CompactBinary v1 payloads.
// The format is undocumented, so this module keeps a small, self-contained
// codec and reads/writes the values through `native-reg`, which is already used
// for the theme registry in electron.js.
//
//   State:    whether Night Light is force-enabled, plus a transition FILETIME
//   Settings: schedule mode/times and the color temperature (intensity)
//
// Slider contract (0-100):
//   1-100 -> Night Light force-enabled now, at that warmth/intensity.
//   0     -> release the manual override and return control to Windows. What
//            that means depends on the user's schedule:
//              schedule disabled -> Off
//              schedule enabled  -> Auto (Windows' schedule decides)
//   The panel surfaces that distinction with an Off/Auto badge. Windows has no
//   safely reverse-engineered "force off until the next schedule boundary"
//   encoding, so we deliberately do not invent one.
//
// Only one field is ever rewritten inside each payload: the force-enable flag
// in the state value and the color temperature in the settings value. Writes
// are done as byte-level patches so any fields this module does not understand
// are preserved exactly rather than dropped. If the expected fields are absent
// or have an unexpected type, the module fails closed (reports "unsupported")
// instead of reconstructing a partially understood blob.
//
// Color temperature is mapped linearly from 6500K (0% / neutral) to 1200K
// (100% / warmest), matching the Windows Night Light strength slider.

const reg = require('native-reg')

const CLOUDSTORE_ROOT = 'Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store'

// The authoritative values live under `DefaultAccount\Current` on Windows 10
// 1809+ and Windows 11. Older builds (and some third-party tools) keep a mirror
// under the legacy `Cache\DefaultAccount$$...\Current` location. Both are read
// so the control still works if a machine only has one of them, and an existing
// mirror is updated alongside the authoritative copy so a stale cached blob
// can't get synced back over a change we just made.
const STATE_KEY_PATHS = [
  `${CLOUDSTORE_ROOT}\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate`,
  `${CLOUDSTORE_ROOT}\\Cache\\DefaultAccount$$windows.data.bluelightreduction.bluelightreductionstate\\Current`
]
const SETTINGS_KEY_PATHS = [
  `${CLOUDSTORE_ROOT}\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.settings\\windows.data.bluelightreduction.settings`,
  `${CLOUDSTORE_ROOT}\\Cache\\DefaultAccount$$windows.data.bluelightreduction.settings\\Current`
]
const DATA_NAME = 'Data'

const MIN_KELVIN = 1200
const MAX_KELVIN = 6500

const FILETIME_EPOCH_OFFSET_SECONDS = 11644473600n
const FILETIME_TICKS_PER_SECOND = 10000000n

const STATE_ENABLE_VALUE = Buffer.from([0x10, 0x00]) // field 0, BT_INT32, value 0

// Bond CompactBinary v1 type identifiers
const BOND = {
  Bool: 2,
  UInt8: 3,
  UInt16: 4,
  UInt32: 5,
  UInt64: 6,
  Float: 7,
  Double: 8,
  String: 9,
  Struct: 10,
  List: 11,
  Set: 12,
  Map: 13,
  Int8: 14,
  Int16: 15,
  Int32: 16,
  Int64: 17,
  WString: 18
}

//
// Bond CompactBinary v1 reader
//

class BondReader {
  constructor(buffer) {
    this.buffer = buffer
    this.pos = 0
  }

  readByte() {
    if (this.pos >= this.buffer.length) throw new Error('Unexpected end of Bond data')
    return this.buffer[this.pos++]
  }

  readHeader() {
    if (this.readByte() !== 0x43 || this.readByte() !== 0x42 || this.readByte() !== 0x01 || this.readByte() !== 0x00) {
      throw new Error('Invalid Bond CompactBinary header')
    }
  }

  readFieldHeader() {
    const raw = this.readByte()
    const type = raw & 0x1f
    const idBits = raw & 0xe0

    if (type === 0) {
      if (idBits === 0) return { stop: true }
      throw new Error('Invalid Bond field header')
    }
    if (type === 1 && idBits === 0) return { stopBase: true }

    let id
    if (idBits === 0xe0) {
      id = this.readByte() | (this.readByte() << 8)
    } else if (idBits === 0xc0) {
      id = this.readByte()
    } else {
      id = idBits >> 5
    }
    return { id, type }
  }

  readVarint() {
    let value = 0n
    let shift = 0n
    while (true) {
      const byte = this.readByte()
      value |= BigInt(byte & 0x7f) << shift
      if (byte < 0x80) break
      shift += 7n
    }
    return value
  }

  readContainerHeader() {
    const type = this.readByte() & 0x1f
    const count = Number(this.readVarint())
    return { type, count }
  }

  skipValue(type) {
    switch (type) {
      case BOND.Bool:
      case BOND.UInt8:
      case BOND.Int8:
        this.readByte()
        break
      case BOND.UInt16:
      case BOND.UInt32:
      case BOND.UInt64:
      case BOND.Int16:
      case BOND.Int32:
      case BOND.Int64:
        this.readVarint()
        break
      case BOND.Float:
        this.pos += 4
        break
      case BOND.Double:
        this.pos += 8
        break
      case BOND.String: {
        const length = Number(this.readVarint())
        this.pos += length
        break
      }
      case BOND.WString: {
        const length = Number(this.readVarint())
        this.pos += length * 2
        break
      }
      case BOND.Struct:
        this.skipStruct()
        break
      case BOND.List:
      case BOND.Set: {
        const { type: elementType, count } = this.readContainerHeader()
        for (let i = 0; i < count; i++) this.skipValue(elementType)
        break
      }
      case BOND.Map: {
        const keyType = this.readByte() & 0x1f
        const valueType = this.readByte() & 0x1f
        const count = Number(this.readVarint())
        for (let i = 0; i < count; i++) {
          this.skipValue(keyType)
          this.skipValue(valueType)
        }
        break
      }
      default:
        throw new Error(`Unknown Bond type: ${type}`)
    }
  }

  skipStruct() {
    while (true) {
      const field = this.readFieldHeader()
      if (field.stop) return
      if (field.stopBase) continue
      this.skipValue(field.type)
    }
  }
}

//
// Bond CompactBinary v1 writer (CloudStore envelope + varints)
//

class BondWriter {
  constructor() {
    this.bytes = []
  }

  writeByte(byte) {
    this.bytes.push(byte & 0xff)
  }

  writeHeader() {
    this.bytes.push(0x43, 0x42, 0x01, 0x00)
  }

  writeFieldHeader(id, type) {
    if (id <= 5) {
      this.writeByte(type | (id << 5))
    } else if (id <= 0xff) {
      this.writeByte(type | (6 << 5))
      this.writeByte(id)
    } else {
      this.writeByte(type | (7 << 5))
      this.writeByte(id)
      this.writeByte(id >> 8)
    }
  }

  writeStop() {
    this.writeByte(0)
  }

  writeVarint(value) {
    let remaining = BigInt(value)
    while (remaining >= 0x80n) {
      this.writeByte(Number(remaining & 0x7fn) | 0x80)
      remaining >>= 7n
    }
    this.writeByte(Number(remaining))
  }

  writeBool(value) {
    this.writeByte(value ? 1 : 0)
  }

  writeContainerHeader(elementType, count) {
    this.writeByte(elementType)
    this.writeVarint(count)
  }

  writeRaw(bytes) {
    for (const byte of bytes) this.writeByte(byte)
  }

  toBuffer() {
    return Buffer.from(this.bytes)
  }
}

function encodeVarint(value) {
  const writer = new BondWriter()
  writer.writeVarint(value)
  return writer.toBuffer()
}

function zigzagEncode(value) {
  const v = BigInt(value)
  return (v << 1n) ^ (v >> 63n)
}

function zigzagDecode(value) {
  const v = BigInt(value)
  return Number((v >> 1n) ^ (-(v & 1n)))
}

//
// CloudStore envelope
//

function unwrapCloudStore(buffer) {
  const reader = new BondReader(buffer)
  reader.readHeader()

  let payload = null

  while (true) {
    const field = reader.readFieldHeader()
    if (field.stop) break
    if (field.stopBase) continue

    // Field 0: metadata struct, always { bool: true }
    if (field.id === 0 && field.type === BOND.Struct) {
      reader.skipStruct()
      continue
    }

    // Field 1: payload container
    if (field.id === 1 && field.type === BOND.Struct) {
      while (true) {
        const containerField = reader.readFieldHeader()
        if (containerField.stop) break
        if (containerField.stopBase) continue

        // Field 1.0: last-modified Unix timestamp
        if (containerField.id === 0 && containerField.type === BOND.UInt64) {
          reader.readVarint()
          continue
        }

        // Field 1.1: data wrapper containing the inner payload as list<int8>
        if (containerField.id === 1 && containerField.type === BOND.Struct) {
          while (true) {
            const wrapperField = reader.readFieldHeader()
            if (wrapperField.stop) break
            if (wrapperField.stopBase) continue
            if (wrapperField.id === 1 && wrapperField.type === BOND.List) {
              const { count } = reader.readContainerHeader()
              payload = buffer.subarray(reader.pos, reader.pos + count)
              reader.pos += count
              continue
            }
            reader.skipValue(wrapperField.type)
          }
          continue
        }

        reader.skipValue(containerField.type)
      }
      continue
    }

    reader.skipValue(field.type)
  }

  if (!payload) throw new Error('Bond payload is missing')
  return { payload }
}

function wrapCloudStore(timestamp, inner) {
  const writer = new BondWriter()
  writer.writeHeader()

  // Field 0: metadata struct { field 0: bool = true }
  writer.writeFieldHeader(0, BOND.Struct)
  writer.writeFieldHeader(0, BOND.Bool)
  writer.writeBool(true)
  writer.writeStop()

  // Field 1: payload container
  writer.writeFieldHeader(1, BOND.Struct)
  writer.writeFieldHeader(0, BOND.UInt64)
  writer.writeVarint(timestamp)

  // Field 1.1: data wrapper
  writer.writeFieldHeader(1, BOND.Struct)
  writer.writeFieldHeader(1, BOND.List)
  writer.writeContainerHeader(BOND.Int8, inner.length)
  writer.writeRaw(inner)
  writer.writeStop()
  writer.writeStop()
  writer.writeStop()

  return writer.toBuffer()
}

function filetimeNow(now) {
  const timestamp = Math.floor(now / 1000)
  const filetime = (BigInt(timestamp) + FILETIME_EPOCH_OFFSET_SECONDS) * FILETIME_TICKS_PER_SECOND + BigInt((now % 1000) * 10000)
  return { timestamp, filetime }
}

//
// State value (force-enable flag + transition FILETIME)
//

// Scans the inner state struct, recording the byte ranges needed to patch it.
// Unknown fields are skipped but never rewritten, so they survive the patch.
function scanState(payload) {
  const reader = new BondReader(payload)
  reader.readHeader()

  let forceEnabled = false
  let field0 = null
  let field20 = null
  let unexpected = false

  while (true) {
    const headerStart = reader.pos
    const field = reader.readFieldHeader()
    if (field.stop) break
    if (field.stopBase) continue

    if (field.id === 0) {
      if (field.type !== BOND.Int32) {
        unexpected = true
        reader.skipValue(field.type)
        continue
      }
      reader.readVarint()
      forceEnabled = true
      field0 = { start: headerStart, end: reader.pos }
      continue
    }

    if (field.id === 20) {
      if (field.type !== BOND.UInt64) {
        unexpected = true
        reader.skipValue(field.type)
        continue
      }
      const valueStart = reader.pos
      reader.readVarint()
      field20 = { start: valueStart, end: reader.pos }
      continue
    }

    reader.skipValue(field.type)
  }

  return { forceEnabled, field0, field20, unexpected }
}

// Returns a patched state blob, or null if the schema isn't recognized.
function patchState(buffer, forceEnabled) {
  const { payload } = unwrapCloudStore(buffer)
  const scan = scanState(payload)

  if (scan.unexpected) return null

  const now = Date.now()
  const { timestamp, filetime } = filetimeNow(now)

  const parts = []
  let cursor = 0

  if (forceEnabled && !scan.forceEnabled) {
    // Field 0 is the lowest id, so it belongs immediately after the header.
    parts.push(payload.subarray(0, 4))
    parts.push(STATE_ENABLE_VALUE)
    cursor = 4
  } else if (!forceEnabled && scan.forceEnabled) {
    parts.push(payload.subarray(0, scan.field0.start))
    cursor = scan.field0.end
  }

  if (scan.field20) {
    parts.push(payload.subarray(cursor, scan.field20.start))
    parts.push(encodeVarint(filetime))
    parts.push(payload.subarray(scan.field20.end))
  } else {
    // Some state blobs omit the transition FILETIME. The enclosing CloudStore
    // timestamp still changes, which is enough for Windows to pick up the write.
    parts.push(payload.subarray(cursor))
  }

  return wrapCloudStore(timestamp, Buffer.concat(parts))
}

//
// Settings value (color temperature)
//

function scanSettings(payload) {
  const reader = new BondReader(payload)
  reader.readHeader()

  let colorTemperature = MAX_KELVIN
  let colorValue = null
  let scheduleEnabled = false
  let setHoursMode = false

  while (true) {
    const field = reader.readFieldHeader()
    if (field.stop) break
    if (field.stopBase) continue

    // Field 0: whether any schedule mode is active.
    if (field.id === 0 && field.type === BOND.Bool) {
      scheduleEnabled = reader.readByte() !== 0
      continue
    }

    // Field 10: presence (value irrelevant) selects "Set Hours" mode.
    if (field.id === 10 && field.type === BOND.Bool) {
      reader.readByte()
      setHoursMode = true
      continue
    }

    // Bond encodes signed integers as ZigZag + varint, so both the documented
    // Int16 field and an Int32 variant decode the same way.
    if (field.id === 40 && (field.type === BOND.Int16 || field.type === BOND.Int32)) {
      const valueStart = reader.pos
      colorTemperature = zigzagDecode(reader.readVarint())
      colorValue = { start: valueStart, end: reader.pos }
      continue
    }

    reader.skipValue(field.type)
  }

  return { colorTemperature, colorValue, scheduleEnabled, setHoursMode }
}

// Returns a settings blob with only the color temperature replaced, or null if
// the schema isn't recognized. Every other byte, including unknown fields, is
// preserved exactly.
function patchColorTemperature(buffer, kelvin) {
  const { payload } = unwrapCloudStore(buffer)
  const scan = scanSettings(payload)

  if (!scan.colorValue) return null

  const { timestamp } = filetimeNow(Date.now())
  const inner = Buffer.concat([
    payload.subarray(0, scan.colorValue.start),
    encodeVarint(zigzagEncode(kelvin)),
    payload.subarray(scan.colorValue.end)
  ])

  return wrapCloudStore(timestamp, inner)
}

// Field 70 (`previewColorTemperatureChanges`) tells Windows to apply a color
// temperature change to the active filter immediately instead of only storing
// it. Microsoft's own Settings slider sets it to true while the user drags and
// removes it on release (verified by capturing the blob during a real drag).
const PREVIEW_FIELD_TRUE = Buffer.from([0xc2, 0x46, 0x01]) // field 70, BT_BOOL, true

// Parses the top-level fields of a Bond struct, recording the byte range of
// each field (including nested structs) so they can be reassembled verbatim.
function parseTopFields(payload) {
  const reader = new BondReader(payload)
  reader.readHeader()

  const fields = []
  let stopIndex = null

  while (true) {
    const start = reader.pos
    const field = reader.readFieldHeader()
    if (field.stop) {
      stopIndex = start
      break
    }
    if (field.stopBase) {
      fields.push({ marker: true, start, end: reader.pos })
      continue
    }
    const valueStart = reader.pos
    reader.skipValue(field.type)
    fields.push({ id: field.id, type: field.type, start, valueStart, end: reader.pos })
  }

  return { headerLength: 4, fields, stopIndex }
}

// Returns a settings blob with the color temperature and/or the preview flag
// updated. Unknown fields are preserved byte-for-byte.
//   kelvin:    new temperature, or undefined to leave it unchanged
//   preview:   true  -> field 70 present and true
//              false -> field 70 removed
//              undefined -> field 70 left as-is
function patchSettings(buffer, options = {}) {
  const { kelvin, preview } = options
  const { payload } = unwrapCloudStore(buffer)
  const parsed = parseTopFields(payload)

  if (parsed.stopIndex === null) return null
  if (!parsed.fields.some((f) => f.id === 40)) return null

  const parts = [payload.subarray(0, parsed.headerLength)]
  let previewEmitted = false

  for (const field of parsed.fields) {
    if (field.marker) {
      parts.push(payload.subarray(field.start, field.end))
      continue
    }

    // Bond requires ascending field ids, so a new field 70 goes immediately
    // before the first field with a higher id (or before the stop).
    if (preview === true && !previewEmitted && field.id > 70) {
      parts.push(PREVIEW_FIELD_TRUE)
      previewEmitted = true
    }

    if (field.id === 40) {
      if (kelvin === undefined) {
        parts.push(payload.subarray(field.start, field.end))
      } else {
        parts.push(payload.subarray(field.start, field.valueStart))
        parts.push(encodeVarint(zigzagEncode(kelvin)))
      }
      continue
    }

    if (field.id === 70) {
      if (preview === false) continue // drop it
      if (preview === true) {
        parts.push(payload.subarray(field.start, field.valueStart))
        parts.push(Buffer.from([0x01]))
      } else {
        parts.push(payload.subarray(field.start, field.end))
      }
      previewEmitted = true
      continue
    }

    parts.push(payload.subarray(field.start, field.end))
  }

  if (preview === true && !previewEmitted) {
    parts.push(PREVIEW_FIELD_TRUE)
  }

  parts.push(payload.subarray(parsed.stopIndex, parsed.stopIndex + 1))

  const { timestamp } = filetimeNow(Date.now())
  return wrapCloudStore(timestamp, Buffer.concat(parts))
}

function settingsHasPreview(buffer) {
  try {
    const { payload } = unwrapCloudStore(buffer)
    return parseTopFields(payload).fields.some((f) => f.id === 70)
  } catch (e) {
    return false
  }
}

//
// Registry access
//

// Reads one location. Returns null when the key/value is absent.
function readRegistryValueAt(keyPath) {
  try {
    const key = reg.openKey(reg.HKCU, keyPath, reg.Access.READ)
    if (!key) return null
    try {
      const value = reg.getValue(key, null, DATA_NAME)
      return Buffer.isBuffer(value) ? value : null
    } finally {
      reg.closeKey(key)
    }
  } catch (e) {
    return null
  }
}

function writeRegistryValueAt(keyPath, buffer) {
  try {
    const key = reg.openKey(reg.HKCU, keyPath, reg.Access.ALL_ACCESS)
    if (!key) return false
    try {
      reg.setValueRaw(key, DATA_NAME, reg.ValueType.BINARY, buffer)
      return true
    } finally {
      reg.closeKey(key)
    }
  } catch (e) {
    console.log('Could not write Night Light registry value', e)
    return false
  }
}

// Writes the authoritative location and, if it already exists in the same
// format, the legacy mirror. Existing modern mirrors are kept in sync so a
// stale cached blob can't be synced back over the value we just wrote. Older
// (prefixed) blobs are left untouched rather than overwritten with a format
// they don't expect.
function writeRegistryValue(keyPaths, buffer) {
  let wrote = false
  keyPaths.forEach((keyPath, index) => {
    if (index === 0) {
      if (writeRegistryValueAt(keyPath, buffer)) wrote = true
      return
    }
    const existing = readRegistryValueAt(keyPath)
    if (existing && canParseCloudStore(existing)) {
      if (writeRegistryValueAt(keyPath, buffer)) wrote = true
    }
  })
  return wrote
}

function canParseCloudStore(buffer) {
  try {
    unwrapCloudStore(buffer)
    return true
  } catch (e) {
    return false
  }
}

// Finds the first location pair (state + settings) that has both values.
function readNightLightBuffers() {
  for (let index = 0; index < STATE_KEY_PATHS.length; index++) {
    const stateBuffer = readRegistryValueAt(STATE_KEY_PATHS[index])
    const settingsBuffer = readRegistryValueAt(SETTINGS_KEY_PATHS[index])
    if (stateBuffer && settingsBuffer) {
      return { stateBuffer, settingsBuffer }
    }
  }
  return null
}

function getWatchPaths() {
  return [...STATE_KEY_PATHS, ...SETTINGS_KEY_PATHS]
}

//
// Diagnostics (read-only; used only to explain an unavailable control)
//

const CLOUDSTORE_CURRENT_KEY = `${CLOUDSTORE_ROOT}\\DefaultAccount\\Current`
const NIGHT_LIGHT_SERVICES = ['CDPUserSvc', 'CDPSvc', 'NcbService']
const DIAGNOSTICS_TTL_MS = 60000

let diagnosticsCache = { time: 0, perDevice: false, disabledServices: [] }

// Windows 11 24H2+ can store per-device BlueLightReduction records alongside
// the shared values (for example with HDR). We detect but never modify these,
// since the per-device format is undocumented.
function hasPerDeviceRecords() {
  try {
    const key = reg.openKey(reg.HKCU, CLOUDSTORE_CURRENT_KEY, reg.Access.READ)
    if (!key) return false
    try {
      return reg.enumKeyNames(key).some((name) => /bluelightreduction.*perdevice/i.test(name))
    } finally {
      reg.closeKey(key)
    }
  } catch (e) {
    return false
  }
}

// Night Light depends on these services; if any is disabled the feature does
// nothing regardless of what the registry says.
function getDisabledNightLightServices() {
  const disabled = []
  for (const name of NIGHT_LIGHT_SERVICES) {
    try {
      const key = reg.openKey(reg.HKLM, `SYSTEM\\CurrentControlSet\\Services\\${name}`, reg.Access.READ)
      if (!key) continue
      try {
        if (reg.getValue(key, null, 'Start') === 4) disabled.push(name)
      } finally {
        reg.closeKey(key)
      }
    } catch (e) {
      // Missing service is not treated as disabled.
    }
  }
  return disabled
}

function getDiagnostics() {
  if (Date.now() - diagnosticsCache.time < DIAGNOSTICS_TTL_MS) {
    return diagnosticsCache
  }
  diagnosticsCache = {
    time: Date.now(),
    perDevice: hasPerDeviceRecords(),
    disabledServices: getDisabledNightLightServices()
  }
  return diagnosticsCache
}

function invalidateDiagnostics() {
  diagnosticsCache = { time: 0, perDevice: false, disabledServices: [] }
}

//
// Helpers
//

function kelvinToLevel(kelvin) {
  if (!(kelvin >= MIN_KELVIN) || !(kelvin <= MAX_KELVIN)) return 100
  return Math.round(100 - ((kelvin - MIN_KELVIN) / (MAX_KELVIN - MIN_KELVIN)) * 100)
}

function levelToKelvin(level) {
  return Math.round(MAX_KELVIN - (level / 100) * (MAX_KELVIN - MIN_KELVIN))
}

function clampLevel(level) {
  const parsed = Number(level)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

//
// Public API
//

function isSupported() {
  return getStatus().supported
}

function getStatus() {
  const buffers = readNightLightBuffers()
  const diagnostics = getDiagnostics()

  if (!buffers) {
    return {
      supported: false,
      forceEnabled: false,
      level: 0,
      scheduleEnabled: false,
      reason: diagnostics.perDevice ? 'per-device' : 'missing',
      warning: null
    }
  }

  try {
    const state = scanState(unwrapCloudStore(buffers.stateBuffer).payload)
    const settings = scanSettings(unwrapCloudStore(buffers.settingsBuffer).payload)

    // Fail closed on schemas we can't safely patch. This hides the control
    // rather than risking a write that drops data we don't understand. The
    // transition FILETIME (field 20) is optional: some state blobs omit it and
    // are still valid.
    if (state.unexpected || !settings.colorValue) {
      console.log('Night Light settings use an unrecognized schema; the control is disabled.')
      return {
        supported: false,
        forceEnabled: !!state.forceEnabled,
        level: 0,
        scheduleEnabled: !!settings.scheduleEnabled,
        reason: 'schema',
        warning: null
      }
    }

    const forceEnabled = !!state.forceEnabled
    // 1-100 while force-enabled; 0 otherwise. The panel renders 0 as Off or
    // Auto depending on the parsed schedule flag.
    const level = forceEnabled ? Math.max(1, kelvinToLevel(settings.colorTemperature)) : 0

    let warning = null
    if (diagnostics.perDevice) warning = 'per-device'
    else if (diagnostics.disabledServices.length) warning = 'services'

    return {
      supported: true,
      forceEnabled,
      level,
      scheduleEnabled: !!settings.scheduleEnabled,
      reason: null,
      warning
    }
  } catch (e) {
    console.log('Could not read Night Light status', e)
    return {
      supported: false,
      forceEnabled: false,
      level: 0,
      scheduleEnabled: false,
      reason: 'schema',
      warning: null
    }
  }
}

// All Night Light writes go through a single queue so only one CloudStore
// modification is ever in flight at a time.
let writeQueue = Promise.resolve()
function enqueueNightLightWrite(task) {
  const result = writeQueue.then(task, task)
  writeQueue = result.then(() => {}, () => {})
  return result
}

const MAX_WRITE_ATTEMPTS = 2

function setLevel(level, options = {}) {
  const desired = clampLevel(level)
  const preview = !!options.preview
  return enqueueNightLightWrite(() => applyLevel(desired, preview))
}

// Fast path used while the user drags the slider: update the temperature and
// set field 70 so Windows applies it to the active filter immediately. No state
// change and no post-write verification (the value is transient).
async function applyPreview(desired) {
  try {
    const buffers = readNightLightBuffers()
    if (!buffers) return null
    const patchedSettings = patchSettings(buffers.settingsBuffer, {
      kelvin: levelToKelvin(desired),
      preview: true
    })
    if (!patchedSettings) return null
    writeRegistryValue(SETTINGS_KEY_PATHS, patchedSettings)

    // Microsoft's slider only previews while Night Light is already on, so make
    // sure the force-enable flag is present when previewing a non-zero level.
    if (desired > 0) {
      const state = scanState(unwrapCloudStore(buffers.stateBuffer).payload)
      if (!state.unexpected && !state.forceEnabled) {
        const patchedState = patchState(buffers.stateBuffer, true)
        if (patchedState) writeRegistryValue(STATE_KEY_PATHS, patchedState)
      }
    }

    return getStatus()
  } catch (e) {
    console.log('Could not preview Night Light level', e)
    return null
  }
}

async function applyLevel(desired, preview) {
  if (preview) return applyPreview(desired)

  try {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const buffers = readNightLightBuffers()
      if (!buffers) return getStatus()

      const state = scanState(unwrapCloudStore(buffers.stateBuffer).payload)
      if (state.unexpected) {
        console.log('Night Light state uses an unrecognized schema; refusing to write.')
        return getStatus()
      }

      let patchedSettings = null
      let patchedState = null

      // Always clear the transient preview flag on a committed write. On top of
      // that: desired 1-100 sets the temperature and makes sure the force-enable
      // flag is present; desired 0 removes the force-enable flag (release the
      // manual override back to Windows' schedule).
      if (desired > 0) {
        patchedSettings = patchSettings(buffers.settingsBuffer, {
          kelvin: levelToKelvin(desired),
          preview: false
        })
        if (!patchedSettings) {
          console.log('Night Light settings use an unrecognized schema; refusing to write.')
          return getStatus()
        }
        if (!state.forceEnabled) {
          patchedState = patchState(buffers.stateBuffer, true)
        }
      } else {
        patchedSettings = settingsHasPreview(buffers.settingsBuffer)
          ? patchSettings(buffers.settingsBuffer, { preview: false })
          : null
        if (state.forceEnabled) {
          patchedState = patchState(buffers.stateBuffer, false)
        }
      }

      // Optimistic concurrency: if Windows (a scheduled transition, the Settings
      // app, or another tool) changed either blob since we read it, rebase the
      // patch on the newest blob instead of overwriting it.
      const fresh = readNightLightBuffers()
      if (!fresh) return getStatus()
      if (!fresh.stateBuffer.equals(buffers.stateBuffer) || !fresh.settingsBuffer.equals(buffers.settingsBuffer)) {
        continue
      }

      if (patchedSettings) writeRegistryValue(SETTINGS_KEY_PATHS, patchedSettings)
      if (patchedState) writeRegistryValue(STATE_KEY_PATHS, patchedState)

      // Post-write verification: re-read and confirm the requested state landed.
      const status = getStatus()
      const verified = desired > 0
        ? (status.supported && status.forceEnabled && status.level === desired)
        : (status.supported && !status.forceEnabled)
      if (verified) return status
    }
  } catch (e) {
    console.log('Could not set Night Light level', e)
  }

  return getStatus()
}

// Removes a lingering preview flag without changing the temperature. Called on
// startup and on resume so a crash mid-drag can't leave Windows previewing.
function clearPreview() {
  try {
    const buffers = readNightLightBuffers()
    if (!buffers || !settingsHasPreview(buffers.settingsBuffer)) return false
    const patched = patchSettings(buffers.settingsBuffer, { preview: false })
    if (!patched) return false
    return writeRegistryValue(SETTINGS_KEY_PATHS, patched)
  } catch (e) {
    return false
  }
}

module.exports = {
  isSupported,
  getStatus,
  setLevel,
  clearPreview,
  getWatchPaths,
  invalidateDiagnostics,
  // Exported for debugging/tests
  _internal: {
    scanState,
    scanSettings,
    patchState,
    patchColorTemperature,
    patchSettings,
    parseTopFields,
    settingsHasPreview,
    unwrapCloudStore,
    wrapCloudStore,
    encodeVarint,
    zigzagEncode,
    kelvinToLevel,
    levelToKelvin
  }
}