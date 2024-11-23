/*
 * index.d.ts: part of the "win32-displayconfig" Node package.
 * See the COPYRIGHT file at the top-level directory of this distribution.
 */

export class Win32Error extends Error {
  code: number;
}

interface AdapterId {
  LowPart: number;
  HighPart: number;
}

interface DisplayConfigFractional {
  Numerator: number;
  Denominator: number;
}

interface SourcePathInfo {
  adapterId: AdapterId;
  id: number;
  statusFlags: number;
  modeInfoIdx: number;
}

interface TargetPathInfo {
  adapterId: AdapterId;
  id: number;
  statusFlags: number;
  outputTechnology: string;
  rotation: number;
  scaling: string;
  refreshRate: DisplayConfigFractional;
  scanlineOrdering: string;
  targetAvailable: number;
  modeInfoIdx: number;
}

interface PathInfoValue {
  flags: number;
  sourceInfo: SourcePathInfo;
  targetInfo: TargetPathInfo;
}

interface PathInfo {
  value: PathInfoValue;
  buffer: Buffer;
}

interface DisplayConfigPosition {
  x: number;
  y: number;
}

interface SourceMode {
  width: number;
  height: number;
  pixelFormat: number;
  position: DisplayConfigPosition;
}

interface SourceModeInfo {
  adapterId: AdapterId;
  id: number;
  infoType: "source";
  sourceMode: SourceMode;
}

interface PixelRate {
  lowPart: number;
  highPart: number;
}

interface DisplayConfigSize {
  cx: number;
  cy: number;
}

interface TargetVideoSignalInfo {
  pixelRate: PixelRate;
  hSyncFreq: DisplayConfigFractional;
  vSyncFreq: DisplayConfigFractional;
  activeSize: DisplayConfigSize;
  totalSize: DisplayConfigSize;
  videoStandard: number;
  scanlineOrdering: string;
}

interface TargetMode {
  targetVideoSignalInfo: TargetVideoSignalInfo;
}

interface TargetModeInfo {
  adapterId: AdapterId;
  id: number;
  infoType: "target";
  targetMode: TargetMode;
}

type ModeInfoValue = SourceModeInfo | TargetModeInfo;

interface ModeInfo {
  value: ModeInfoValue;
  buffer: Buffer;
}

interface NameInfo {
  adapterId: AdapterId;
  id: number;
  outputTechnology: string;
  edidManufactureId: number;
  edidProductCodeId: number;
  connectorInstance: number;
  monitorFriendlyDeviceName: string;
  monitorDevicePath: string;
}

export interface QueryDisplayConfigResults {
  pathArray: PathInfo[];
  modeInfoArray: ModeInfo[];
  nameArray: NameInfo[];
}

export function queryDisplayConfig(): Promise<QueryDisplayConfigResults>;

interface ConfigId {
  adapterId: AdapterId;
  id: number;
}

export interface ExtractedDisplayConfig {
  displayName: string;
  devicePath: string;
  sourceConfigId: ConfigId;
  targetConfigId: ConfigId;
  inUse: boolean;
  outputTechnology: string;
  rotation: number;
  scaling: string;
  sourceMode: SourceMode;
  targetVideoSignalInfo?: TargetVideoSignalInfo;
  pathBuffer: Buffer;
  sourceModeBuffer: Buffer;
  targetModeBuffer?: Buffer;
}

export function extractDisplayConfig(): Promise<ExtractedDisplayConfig>;

export interface ToggleEnabledDisplayArgs {
  enablePaths: string[];
  disablePaths: string[];
  persistent: boolean;
}

export function toggleEnabledDisplays(
  args: ToggleEnabledDisplayArgs
): Promise<void>;

export interface DisplayResotrationConfigurationEntry {
  devicePath: string;
  pathBuffer: string;
  sourceModeBuffer: string;
  targetModeBuffer: string;
}

export function displayConfigForRestoration(): Promise<
  DisplayResotrationConfigurationEntry[]
>;

export interface RestoreDisplayConfigArgs {
  config: DisplayResotrationConfigurationEntry[];
  persistent: boolean;
}

export function restoreDisplayConfig(
  args: RestoreDisplayConfigArgs
): Promise<void>;

export type DisplayChangeListener = {
  (err: Error): void;
  (err: null, conf: ExtractedDisplayConfig): void;
};

export function addDisplayChangeListener(
  listener: DisplayChangeListener
): DisplayChangeListener;
export function removeDisplayChangeListener(
  listener: DisplayChangeListener
): void;

export class VerticalRefreshRateContext {
  findVerticalRefreshRateForDisplayPoint(
    x: number,
    y: number
  ): Promise<number | undefined>;
  close(): void;
}
