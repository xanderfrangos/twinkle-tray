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
      if (task != NULL) {
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
    if (task == NULL) {
      return Napi::Boolean::New(info.Env(), false);
    }

    // This call is made synchronously from Electron's main process on an
    // explicit user toggle (not a hot path), and RequestEnableAsync() can
    // legitimately take a few seconds on first-time AppX registration, so
    // give it more room than a cold-start WinRT call before treating it as
    // a failure.
    auto enableAsync = task.RequestEnableAsync();
    if (enableAsync.wait_for(std::chrono::seconds{5})
        != winrt::Windows::Foundation::AsyncStatus::Completed) {
      return Napi::Boolean::New(info.Env(), false);
    }

    return Napi::Boolean::New(
      info.Env(), enableAsync.get() == Windows::ApplicationModel::StartupTaskState::Enabled);
  } catch (...) {
    return Napi::Boolean::New(info.Env(), false);
  }
}

Napi::Boolean Disable(const Napi::CallbackInfo &info) {
  try {
    Windows::ApplicationModel::StartupTask task = getStartupTask();
    if (task == NULL) {
      return Napi::Boolean::New(info.Env(), false);
    }

    task.Disable();
    return Napi::Boolean::New(
      info.Env(), task.State() != Windows::ApplicationModel::StartupTaskState::Enabled);
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
