#include "ActiveWindow.h"

namespace PaymoActiveWindow {
	std::mutex ActiveWindow::smutex;
	std::unordered_map<HWINEVENTHOOK, ActiveWindow*> ActiveWindow::winEventProcCbCtx;

	ActiveWindow::ActiveWindow(unsigned int iconCacheSize) {

	}

	ActiveWindow::~ActiveWindow() {
		// stop watch thread
		if (this->watchThread != NULL) {
			this->threadShouldExit.store(true, std::memory_order_relaxed);
			this->watchThread->join();
			delete this->watchThread;
			this->watchThread = NULL;
		}

		// tear down COM
		CoUninitialize();
	}

	WindowInfo* ActiveWindow::getActiveWindow() {
		HWND h = GetForegroundWindow();

		if (h == NULL) {
			return NULL;
		}

		WindowInfo* info = new WindowInfo();

		// get window title
		info->title = this->getWindowTitle(h);

		// get process pid
		DWORD pid;
		GetWindowThreadProcessId(h, &pid);
		info->pid = (unsigned int)pid;

		// get process handle
		HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);

		if (hProc == NULL) {
			delete info;
			return NULL;
		}

		// get app path
		info->path = this->getProcessPath(hProc);
		CloseHandle(hProc);

		// check if app is UWP app
		if (this->isUWPApp(info->path)) {
			info->isUWPApp = true;

			EnumChildWindowsCbParam* cbParam = new EnumChildWindowsCbParam(this);
			EnumChildWindows(h, EnumChildWindowsCb, (LPARAM)cbParam);
			
			if (!cbParam->ok) {
				delete cbParam;
				delete info;
				return NULL;
			}

			info->path = cbParam->path;
			// save handle of UWP process
			hProc = cbParam->hProc;
			delete cbParam;
		}

		// get app name
		info->application = this->getProcessName(info->path);
		if (info->application.size() == 0) {
			info->application = this->basename(info->path);
		}

		if (info->isUWPApp) {
			info->uwpPackage = this->getUWPPackage(hProc);

			// we need to close the handle of the UWP process
			CloseHandle(hProc);
		}

		return info;
	}

	watch_t ActiveWindow::watchActiveWindow(watch_callback cb) {
		watch_t watchId = this->nextWatchId++;

		this->mutex.lock();
		this->watches[watchId] = cb;
		this->mutex.unlock();

		// register hook if not registered
		if (this->watchThread == NULL) {
			this->threadShouldExit.store(false, std::memory_order_relaxed);
			this->watchThread = new std::thread(&ActiveWindow::runWatchThread, this);
		}

		return watchId;
	}

	void ActiveWindow::unwatchActiveWindow(watch_t watch) {
		this->mutex.lock();
		this->watches.erase(watch);
		this->mutex.unlock();
	}

	std::wstring ActiveWindow::getWindowTitle(HWND hWindow) {
		int len = GetWindowTextLengthW(hWindow);

		if(!len) {
			return L"";
		}

		std::vector<wchar_t> buf(len + 1);
		if (!GetWindowTextW(hWindow, buf.data(), len + 1)) {
			return L"";
		}
		std::wstring title(buf.begin(), buf.begin() + len);
		
		return title;
	}

	std::wstring ActiveWindow::getProcessPath(HANDLE hProc) {
		std::vector<wchar_t> buf(MAX_PATH);
		DWORD len = MAX_PATH;
		if (!QueryFullProcessImageNameW(hProc, 0, buf.data(), &len)) {
			return L"";
		}
		std::wstring name(buf.begin(), buf.begin() + len);

		return name;
	}

	std::wstring ActiveWindow::getProcessName(std::wstring path) {
		DWORD infoSize = GetFileVersionInfoSizeW(path.c_str(), NULL);

		if (!infoSize) {
			return L"";
		}

		LPBYTE data = new BYTE[infoSize];
		if (!GetFileVersionInfoW(path.c_str(), 0, infoSize, data)) {
			delete data;
			return L"";
		}

		struct LANGCODEPAGE {
			WORD lang;
			WORD codePage;
		} *langData, active;

		active.lang = 0x0409;
		active.codePage = 0x04E4;

		UINT langDataLen = 0;
		if (VerQueryValueW(data, L"\\VarFileInfo\\Translation", (void**)&langData, &langDataLen)) {
			if (langDataLen) {
				active.lang = langData[0].lang;
				active.codePage = langData[0].codePage;
			}
		}

		// build path to query file description
		std::wstringstream localePath;
		std::ios_base::fmtflags flags(localePath.flags());

		localePath<<L"\\StringFileInfo\\";
		localePath<<std::uppercase<<std::setfill(L'0')<<std::setw(4)<<std::hex<<active.lang;
		localePath<<std::uppercase<<std::setfill(L'0')<<std::setw(4)<<std::hex<<active.codePage;
		localePath.flags(flags);
		localePath<<L"\\FileDescription";

		void* localDesc;
		UINT localDescLen = 0;
		if (!VerQueryValueW(data, localePath.str().c_str(), &localDesc, &localDescLen)) {
			delete data;
			return L"";
		}

		if (!localDescLen) {
			delete data;
			return L"";
		}

		std::wstring name((wchar_t*)localDesc);

		delete data;
		return name;
	}

	std::wstring ActiveWindow::getUWPPackage(HANDLE hProc) {
		UINT32 len = 0;
		GetPackageFamilyName(hProc, &len, NULL);

		if (!len) {
			return L"";
		}

		std::vector<wchar_t> buf(len);
		if (GetPackageFamilyName(hProc, &len, buf.data()) != ERROR_SUCCESS) {
			return L"";
		}

		std::wstring package(buf.begin(), buf.begin() + len - 1);

		return package;
	}

	std::wstring ActiveWindow::basename(std::wstring path) {
		size_t lastSlash = path.find_last_of(L"\\");

		if (lastSlash == std::string::npos) {
			return path;
		}

		return path.substr(lastSlash + 1);
	}

	bool ActiveWindow::isUWPApp(std::wstring path) {
		return this->basename(path) == L"ApplicationFrameHost.exe";
	}

	std::wstring ActiveWindow::getUWPPackagePath(HANDLE hProc) {
		UINT32 pkgIdLen = 0;
		GetPackageId(hProc, &pkgIdLen, NULL);
		BYTE* pkgId = new BYTE[pkgIdLen];
		GetPackageId(hProc, &pkgIdLen, pkgId);

		UINT32 len = 0;
		GetPackagePath((PACKAGE_ID*)pkgId, 0, &len, NULL);

		std::vector<wchar_t> buf(len);
		if (GetPackagePath((PACKAGE_ID*)pkgId, 0, &len, buf.data()) != ERROR_SUCCESS) {
			delete pkgId;
			return L"";
		}

		std::wstring pkgPath(buf.begin(), buf.begin() + len - 1);

		delete pkgId;
		return pkgPath;
	}

	IAppxManifestProperties* ActiveWindow::getUWPPackageProperties(std::wstring pkgPath) {
		IAppxFactory* appxFactory = NULL;
		if (FAILED(CoCreateInstance(__uuidof(AppxFactory), NULL, CLSCTX_INPROC_SERVER, __uuidof(IAppxFactory), (LPVOID*)&appxFactory))) {
			return NULL;
		}

		IStream* manifestStream;
		std::wstring manifestPath = pkgPath + L"\\AppxManifest.xml";
		if (FAILED(SHCreateStreamOnFileEx(manifestPath.c_str(), STGM_READ | STGM_SHARE_EXCLUSIVE, 0, FALSE, NULL, &manifestStream))) {
			appxFactory->Release();
			return NULL;
		}

		IAppxManifestReader* manifestReader = NULL;
		if (FAILED(appxFactory->CreateManifestReader(manifestStream, &manifestReader))) {
			appxFactory->Release();
			manifestStream->Release();
			return NULL;
		}

		IAppxManifestProperties* properties = NULL;
		if (FAILED(manifestReader->GetProperties(&properties))) {
			appxFactory->Release();
			manifestStream->Release();
			manifestReader->Release();
			return NULL;
		}
		
		appxFactory->Release();
		manifestStream->Release();
		manifestReader->Release();
		return properties;
	}

	void ActiveWindow::runWatchThread() {
		HWINEVENTHOOK hHook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_OBJECT_NAMECHANGE, NULL, WinEventProcCb, 0, 0, WINEVENT_OUTOFCONTEXT);

		// store context for callback
		ActiveWindow::smutex.lock();
		ActiveWindow::winEventProcCbCtx[hHook] = this;
		ActiveWindow::smutex.unlock();

		MSG msg;
		UINT_PTR timer = SetTimer(NULL, NULL, 500, nullptr); // run message loop at least every 500 ms

		for (;;) {
			BOOL getMsgRet = GetMessage(&msg, NULL, 0, 0);

			if (getMsgRet == -1) {
				continue;
			}

			if (msg.message = WM_TIMER) {
				// check if we should exit
				if (this->threadShouldExit.load(std::memory_order_relaxed)) {
					break;
				}
			}

			TranslateMessage(&msg);
			DispatchMessage(&msg);
		}

		// remove timer
		KillTimer(NULL, timer);

		// remove hook
		UnhookWinEvent(hHook);

		// remove context
		ActiveWindow::smutex.lock();
		ActiveWindow::winEventProcCbCtx.erase(hHook);
		ActiveWindow::smutex.unlock();
	}

	BOOL CALLBACK ActiveWindow::EnumChildWindowsCb(HWND hWindow, LPARAM param) {
		EnumChildWindowsCbParam* cbParam = (EnumChildWindowsCbParam*)param;

		DWORD pid;
		GetWindowThreadProcessId(hWindow, &pid);
		HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);

		if (hProc == NULL) {
			return true;
		}

		cbParam->path = cbParam->aw->getProcessPath(hProc);
		cbParam->hProc = hProc;

		UINT32 _len = 0;
		if (GetPackageFamilyName(cbParam->hProc, &_len, NULL) == APPMODEL_ERROR_NO_PACKAGE) {
			CloseHandle(hProc);
			return true;
		}

		cbParam->ok = true;
		return false;
	}

	VOID CALLBACK ActiveWindow::WinEventProcCb(HWINEVENTHOOK hHook, DWORD event, HWND hWindow, LONG idObject, LONG idChild, DWORD eventThread, DWORD eventTime) {
		if (event != EVENT_SYSTEM_FOREGROUND && event != EVENT_OBJECT_NAMECHANGE) {
			// not interested in these
			return;
		}

		HWND foregroundWindow = GetForegroundWindow();

		if (event == EVENT_OBJECT_NAMECHANGE && hWindow != foregroundWindow) {
			// name changed, but not for current window
			return;
		}

		// get context
		ActiveWindow::smutex.lock();
		ActiveWindow* aw = ActiveWindow::winEventProcCbCtx[hHook];
		ActiveWindow::smutex.unlock();

		WindowInfo* info = aw->getActiveWindow();

		// notify every callback
		aw->mutex.lock();
		for (std::unordered_map<watch_t, watch_callback>::iterator it = aw->watches.begin(); it != aw->watches.end(); it++) {
			try {
				it->second(info);
			}
			catch (...) {
				// doing nothing
			}
		}
		aw->mutex.unlock();

		delete info;
	}
}
