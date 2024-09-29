{
  "targets": [
    {
      "target_name": "wmi_bridge",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "conditions": [
        ["OS=='win'", {
      	  "sources": [ "wmi-bridge.cc" ]
      	}],
      ],
      "msvs_settings": {
        "VCCLCompilerTool": { 'AdditionalOptions': ['/permissive'], },
      },
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
    }
  ]
}