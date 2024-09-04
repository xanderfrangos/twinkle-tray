import type {
	Module,
	NativeWindowInfo,
	WindowInfo,
	IActiveWindow,
	InitializeOptions
} from './types';

const SUPPORTED_PLATFORMS = ['win32', 'linux', 'darwin'];

let addon: Module<NativeWindowInfo> | undefined;

if (SUPPORTED_PLATFORMS.includes(process.platform)) {
	addon = require('../build/Release/PaymoActiveWindow.node'); // eslint-disable-line import/no-dynamic-require
} else {
	throw new Error(
		`Unsupported platform. The supported platforms are: ${SUPPORTED_PLATFORMS.join(
			','
		)}`
	);
}

const encodeWindowInfo = (info: NativeWindowInfo): WindowInfo => {
	return {
		title: info.title,
		application: info.application,
		path: info.path,
		pid: info.pid,
		icon: info.icon,
		...(process.platform == 'win32'
			? {
					windows: {
						isUWPApp: info['windows.isUWPApp'] || false,
						uwpPackage: info['windows.uwpPackage'] || ''
					}
			  }
			: {})
	};
};

const ActiveWindow: IActiveWindow = {
	getActiveWindow: (): WindowInfo => {
		if (!addon) {
			throw new Error('Failed to load native addon');
		}

		const info = addon.getActiveWindow();

		return encodeWindowInfo(info);
	},
	subscribe: (callback: (windowInfo: WindowInfo | null) => void): number => {
		if (!addon) {
			throw new Error('Failed to load native addon');
		}

		const watchId = addon.subscribe(nativeWindowInfo => {
			callback(
				!nativeWindowInfo ? null : encodeWindowInfo(nativeWindowInfo)
			);
		});

		return watchId;
	},
	unsubscribe: (watchId: number): void => {
		if (!addon) {
			throw new Error('Failed to load native addon');
		}

		if (watchId < 0) {
			throw new Error('Watch ID must be a positive number');
		}

		addon.unsubscribe(watchId);
	},
	initialize: ({ osxRunLoop }: InitializeOptions = {}): void => {
		if (!addon) {
			throw new Error('Failed to load native addon');
		}

		if (addon.initialize) {
			addon.initialize();
		}

		// set up runloop on MacOS
		if (process.platform == 'darwin' && osxRunLoop) {
			const interval = setInterval(() => {
				if (addon && addon.runLoop) {
					addon.runLoop();
				} else {
					clearInterval(interval);
				}
			}, 100);
		}
	},
	requestPermissions: (): boolean => {
		if (!addon) {
			throw new Error('Failed to load native addon');
		}

		if (addon.requestPermissions) {
			return addon.requestPermissions();
		}

		return true;
	}
};

export * from './types';
export default ActiveWindow;
