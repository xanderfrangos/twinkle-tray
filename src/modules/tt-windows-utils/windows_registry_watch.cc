#include <napi.h>
#include <windows.h>

#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

// Watches one or more HKCU subkeys for value changes and invokes a JavaScript
// callback (on the main thread) whenever any of them changes. Windows has no
// polling-free Node API for this, so RegNotifyChangeKeyValue is used with an
// event handle on a dedicated background thread. The JS side is expected to
// coalesce/debounce the callbacks before re-reading authoritative state.
namespace {

struct RegistryWatcher {
  std::vector<HKEY> keys;
  std::vector<HANDLE> events;
  HANDLE stopEvent = nullptr;
  std::thread thread;
  std::atomic<bool> stopped{false};
  Napi::ThreadSafeFunction tsfn;
};

std::mutex g_mutex;
std::unordered_map<uint32_t, RegistryWatcher*> g_watchers;
uint32_t g_nextId = 1;

std::wstring Utf8ToWide(const std::string& utf8)
{
  if (utf8.empty()) return std::wstring();
  int length = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
  if (length <= 1) return std::wstring();
  std::wstring wide(static_cast<size_t>(length - 1), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, &wide[0], length);
  return wide;
}

void ArmKey(RegistryWatcher* watcher, size_t index)
{
  ResetEvent(watcher->events[index]);
  RegNotifyChangeKeyValue(
    watcher->keys[index],
    TRUE,
    REG_NOTIFY_CHANGE_LAST_SET,
    watcher->events[index],
    TRUE);
}

void WatchLoop(RegistryWatcher* watcher)
{
  const DWORD eventCount = static_cast<DWORD>(watcher->events.size());

  std::vector<HANDLE> handles(watcher->events.begin(), watcher->events.end());
  handles.push_back(watcher->stopEvent);
  const DWORD handleCount = static_cast<DWORD>(handles.size());

  for (size_t i = 0; i < watcher->keys.size(); i++) ArmKey(watcher, i);

  while (!watcher->stopped.load()) {
    const DWORD result = WaitForMultipleObjects(handleCount, handles.data(), FALSE, 1000);

    if (result == WAIT_OBJECT_0 + eventCount) break;  // stop event

    if (result >= WAIT_OBJECT_0 && result < WAIT_OBJECT_0 + eventCount) {
      const size_t index = result - WAIT_OBJECT_0;
      watcher->tsfn.NonBlockingCall();
      ArmKey(watcher, index);
    } else if (result == WAIT_TIMEOUT) {
      // Re-arm periodically so a key that was deleted/recreated is picked up.
      for (size_t i = 0; i < watcher->keys.size(); i++) ArmKey(watcher, i);
    }
  }

  watcher->tsfn.Release();
}

void DestroyWatcher(RegistryWatcher* watcher)
{
  watcher->stopped.store(true);
  if (watcher->stopEvent) SetEvent(watcher->stopEvent);
  if (watcher->thread.joinable()) watcher->thread.join();

  for (HKEY key : watcher->keys) {
    if (key) RegCloseKey(key);
  }
  for (HANDLE event : watcher->events) {
    if (event) CloseHandle(event);
  }
  if (watcher->stopEvent) CloseHandle(watcher->stopEvent);

  delete watcher;
}

Napi::Number Watch(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsArray() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "watch(paths, callback) requires an array of key paths and a callback")
      .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 0);
  }

  Napi::Array paths = info[0].As<Napi::Array>();
  auto* watcher = new RegistryWatcher();

  for (uint32_t i = 0; i < paths.Length(); i++) {
    Napi::Value value = paths.Get(i);
    if (!value.IsString()) continue;

    const std::wstring subKey = Utf8ToWide(value.As<Napi::String>().Utf8Value());
    if (subKey.empty()) continue;

    HKEY key = nullptr;
    if (RegOpenKeyExW(HKEY_CURRENT_USER, subKey.c_str(), 0, KEY_NOTIFY, &key) != ERROR_SUCCESS) {
      continue;
    }

    HANDLE event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!event) {
      RegCloseKey(key);
      continue;
    }

    watcher->keys.push_back(key);
    watcher->events.push_back(event);
  }

  if (watcher->keys.empty()) {
    delete watcher;
    return Napi::Number::New(env, 0);
  }

  watcher->stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  watcher->tsfn = Napi::ThreadSafeFunction::New(
    env,
    info[1].As<Napi::Function>(),
    "TwinkleTrayRegistryWatcher",
    0,
    1);

  uint32_t id;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    id = g_nextId++;
    g_watchers[id] = watcher;
  }

  watcher->thread = std::thread(WatchLoop, watcher);
  return Napi::Number::New(env, id);
}

Napi::Boolean Stop(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    return Napi::Boolean::New(env, false);
  }

  const uint32_t id = info[0].As<Napi::Number>().Uint32Value();
  RegistryWatcher* watcher = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    auto it = g_watchers.find(id);
    if (it != g_watchers.end()) {
      watcher = it->second;
      g_watchers.erase(it);
    }
  }

  if (!watcher) return Napi::Boolean::New(env, false);

  DestroyWatcher(watcher);
  return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
  exports.Set("watch", Napi::Function::New(env, Watch));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}

}  // namespace

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)