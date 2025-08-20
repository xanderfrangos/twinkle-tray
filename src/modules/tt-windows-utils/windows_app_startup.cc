#include <napi.h>
#pragma comment(lib, "windowsapp")
#include <winrt/Windows.ApplicationModel.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>

using namespace winrt;

typedef winrt::Windows::ApplicationModel::StartupTask StartupTask;

StartupTask getStartupTask() {

  try {
    winrt::Windows::Foundation::IAsyncOperation<
        winrt::Windows::Foundation::Collections::IVectorView<StartupTask>>
        package_async = StartupTask::GetForCurrentPackageAsync();
    if (package_async.wait_for(std::chrono::seconds{1}) !=
        winrt::Windows::Foundation::AsyncStatus::Completed) {
      return NULL;
    }

    winrt::Windows::Foundation::Collections::IVectorView<StartupTask> tasks =
        package_async.get();
    for (auto &&task : tasks) {
      if (tasks != NULL) {
        return task;
      }
    }
  } catch (...) {
    return NULL;
  }

  return NULL;
}

Napi::Boolean Enable(const Napi::CallbackInfo &info) {
  try {
    StartupTask task = getStartupTask();
    if (task != NULL) {
      task.RequestEnableAsync();
    }

    return Napi::Boolean::New(info.Env(), true);
  } catch (...) {
    return Napi::Boolean::New(info.Env(), false);
  }
}

Napi::Boolean Disable(const Napi::CallbackInfo &info) {
  try {
    Windows::ApplicationModel::StartupTask task = getStartupTask();
    if (task != NULL) {
      task.Disable();
    }
    return Napi::Boolean::New(info.Env(), true);
  } catch (...) {
    return Napi::Boolean::New(info.Env(), false);
  }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {

  exports.Set(Napi::String::New(env, "enable"),
              Napi::Function::New(env, Enable));

  exports.Set(Napi::String::New(env, "disable"),
              Napi::Function::New(env, Disable));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);