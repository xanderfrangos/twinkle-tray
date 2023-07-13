#include "module.h"

Napi::Object module::Init(Napi::Env env, Napi::Object exports) {
	env.SetInstanceData(new PaymoActiveWindow::ActiveWindow(0));

	exports.Set("getActiveWindow", Napi::Function::New(env, module::getActiveWindow));
	exports.Set("subscribe", Napi::Function::New(env, module::subscribe));
	exports.Set("unsubscribe", Napi::Function::New(env, module::unsubscribe));

	return exports;
}

Napi::Object module::getActiveWindow(const Napi::CallbackInfo& info) {
	PaymoActiveWindow::ActiveWindow* activeWindow = info.Env().GetInstanceData<PaymoActiveWindow::ActiveWindow>();
	if (activeWindow == NULL) {
		Napi::Error::New(info.Env(), "ActiveWindow module not initialized").ThrowAsJavaScriptException();
		return Napi::Object::Object();
	}

	PaymoActiveWindow::WindowInfo* windowInfo = activeWindow->getActiveWindow();
	if (windowInfo == NULL) {
		Napi::Error::New(info.Env(), "Failed to get active window").ThrowAsJavaScriptException();
		return Napi::Object::Object();
	}

	Napi::Object result = module::encodeWindowInfo(info.Env(), windowInfo);

	delete windowInfo;

	return result;
}

Napi::Number module::subscribe(const Napi::CallbackInfo& info) {
	PaymoActiveWindow::ActiveWindow* activeWindow = info.Env().GetInstanceData<PaymoActiveWindow::ActiveWindow>();
	if (activeWindow == NULL) {
		Napi::Error::New(info.Env(), "ActiveWindow module not initialized").ThrowAsJavaScriptException();
		return Napi::Number::New(info.Env(), -1);
	}

	if (info.Length() != 1) {
		Napi::TypeError::New(info.Env(), "Expected 1 argument").ThrowAsJavaScriptException();
		return Napi::Number::New(info.Env(), -1);
	}

	if (!info[0].IsFunction()) {
		Napi::TypeError::New(info.Env(), "Expected first argument to be function").ThrowAsJavaScriptException();
		return Napi::Number::New(info.Env(), -1);
	}

	Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(info.Env(), info[0].As<Napi::Function>(), "Active Window Callback", 0, 2);
	auto mainThreadCallback = [](Napi::Env env, Napi::Function jsCallback, PaymoActiveWindow::WindowInfo* windowInfo) {
		if (windowInfo == NULL) {
			jsCallback.Call({ env.Null() });
		}
		else {
			jsCallback.Call({ module::encodeWindowInfo(env, windowInfo) });
			delete windowInfo;
		}
	};

	PaymoActiveWindow::watch_t watchId = activeWindow->watchActiveWindow([tsfn, mainThreadCallback](PaymoActiveWindow::WindowInfo* windowInfo) {
		if (windowInfo == NULL) {
			tsfn.BlockingCall((PaymoActiveWindow::WindowInfo*)NULL, mainThreadCallback);
			return;
		}

		// clone window info
		PaymoActiveWindow::WindowInfo* arg = new PaymoActiveWindow::WindowInfo();
		*arg = *windowInfo;

		tsfn.BlockingCall(arg, mainThreadCallback);
	});

	return Napi::Number::New(info.Env(), watchId);
}

void module::unsubscribe(const Napi::CallbackInfo& info) {
	PaymoActiveWindow::ActiveWindow* activeWindow = info.Env().GetInstanceData<PaymoActiveWindow::ActiveWindow>();
	if (activeWindow == NULL) {
		Napi::Error::New(info.Env(), "ActiveWindow module not initialized").ThrowAsJavaScriptException();
		return;
	}

	if (info.Length() != 1) {
		Napi::TypeError::New(info.Env(), "Expected 1 argument").ThrowAsJavaScriptException();
		return;
	}

	if (!info[0].IsNumber()) {
		Napi::TypeError::New(info.Env(), "Expected first argument to be number").ThrowAsJavaScriptException();
		return;
	}

	PaymoActiveWindow::watch_t watchId = info[0].As<Napi::Number>().Uint32Value();

	activeWindow->unwatchActiveWindow(watchId);
}

Napi::Object module::encodeWindowInfo(Napi::Env env, PaymoActiveWindow::WindowInfo* windowInfo) {
	Napi::Object result = Napi::Object::New(env);
	result.Set("title", Napi::String::New(env, std::u16string(windowInfo->title.begin(), windowInfo->title.end())));
	result.Set("application", Napi::String::New(env, std::u16string(windowInfo->application.begin(), windowInfo->application.end())));
	result.Set("path", Napi::String::New(env, std::u16string(windowInfo->path.begin(), windowInfo->path.end())));
	result.Set("pid", Napi::Number::New(env, windowInfo->pid));
	result.Set("windows.isUWPApp", Napi::Boolean::New(env, windowInfo->isUWPApp));
	result.Set("windows.uwpPackage", Napi::String::New(env, std::u16string(windowInfo->uwpPackage.begin(), windowInfo->uwpPackage.end())));
	result.Set("icon", Napi::String::New(env, windowInfo->icon));

	return result;
}
