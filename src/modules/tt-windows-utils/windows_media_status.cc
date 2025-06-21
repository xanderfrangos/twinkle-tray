#include <napi.h>
#pragma comment(lib, "windowsapp")
#include <winrt/Windows.ApplicationModel.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>
#include <winrt/Windows.Media.h>

using namespace winrt;
using namespace Windows::Media::Control;

typedef GlobalSystemMediaTransportControlsSessionManager GSMTCSM;
typedef GlobalSystemMediaTransportControlsSessionPlaybackStatus
    SessionPlaybackStatus;
typedef GlobalSystemMediaTransportControlsSessionMediaProperties
    MediaProperties;
typedef Windows::Media::MediaPlaybackType MediaPlaybackType;

Napi::String getPlaybackStatus(const Napi::CallbackInfo &info) {
  std::string statusStr = "closed";

  try {
    auto session_async = GSMTCSM::RequestAsync();
    if (session_async.wait_for(std::chrono::seconds{1}) !=
        winrt::Windows::Foundation::AsyncStatus::Completed) {
      return Napi::String::New(info.Env(), statusStr);
    }

    GSMTCSM manager = session_async.get();
    GlobalSystemMediaTransportControlsSession session =
        manager.GetCurrentSession();

    if (session == NULL)
      return Napi::String::New(info.Env(), statusStr);

    SessionPlaybackStatus status = session.GetPlaybackInfo().PlaybackStatus();

    switch (status) {
    case SessionPlaybackStatus::Opened:
      statusStr = "opened";
      break;
    case SessionPlaybackStatus::Changing:
      statusStr = "changing";
      break;
    case SessionPlaybackStatus::Stopped:
      statusStr = "stopped";
      break;
    case SessionPlaybackStatus::Playing:
      statusStr = "playing";
      break;
    case SessionPlaybackStatus::Paused:
      statusStr = "paused";
      break;
    }
  } catch (std::runtime_error &e) {
  }

  return Napi::String::New(info.Env(), statusStr);
}

Napi::Object getPlaybackInfo(const Napi::CallbackInfo &info) {
  Napi::Object obj = Napi::Object::New(info.Env());

  try {
    auto session_async = GSMTCSM::RequestAsync();
    if (session_async.wait_for(std::chrono::seconds{1}) !=
        winrt::Windows::Foundation::AsyncStatus::Completed) {
      return obj;
    }
    GSMTCSM manager = session_async.get();
    GlobalSystemMediaTransportControlsSession session =
        manager.GetCurrentSession();

    if (session == NULL)
      return obj;

    MediaProperties playback = session.TryGetMediaPropertiesAsync().get();

    if (playback == NULL)
      return obj;

    obj.Set(Napi::String::New(info.Env(), "title"),
            Napi::String::New(info.Env(),
                              winrt::to_string(playback.Title().c_str())));

    obj.Set(Napi::String::New(info.Env(), "subtitle"),
            Napi::String::New(info.Env(),
                              winrt::to_string(playback.Subtitle().c_str())));

    obj.Set(Napi::String::New(info.Env(), "artist"),
            Napi::String::New(info.Env(),
                              winrt::to_string(playback.Artist().c_str())));

    obj.Set(Napi::String::New(info.Env(), "album"),
            Napi::String::New(info.Env(),
                              winrt::to_string(playback.AlbumTitle().c_str())));

    obj.Set(Napi::String::New(info.Env(), "albumartist"),
            Napi::String::New(
                info.Env(), winrt::to_string(playback.AlbumArtist().c_str())));

    obj.Set(Napi::String::New(info.Env(), "source"),
            Napi::String::New(
                info.Env(),
                winrt::to_string(session.SourceAppUserModelId().c_str())));

    obj.Set(Napi::String::New(info.Env(), "tracks"),
            Napi::Number::New(info.Env(), playback.AlbumTrackCount()));

    obj.Set(Napi::String::New(info.Env(), "tracknumber"),
            Napi::Number::New(info.Env(), playback.TrackNumber()));

    std::string typeStr = "unknown";
    MediaPlaybackType type = playback.PlaybackType().Value();

    switch (type) {
    case MediaPlaybackType::Music:
      typeStr = "music";
      break;
    case MediaPlaybackType::Video:
      typeStr = "video";
      break;
    case MediaPlaybackType::Image:
      typeStr = "image";
      break;
    }

    obj.Set(Napi::String::New(info.Env(), "type"),
            Napi::String::New(info.Env(), typeStr));
  } catch (std::runtime_error &e) {
  }

  return obj;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {

  exports.Set(Napi::String::New(env, "getPlaybackStatus"),
              Napi::Function::New(env, getPlaybackStatus));
              
  exports.Set(Napi::String::New(env, "getPlaybackInfo"),
              Napi::Function::New(env, getPlaybackInfo));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);