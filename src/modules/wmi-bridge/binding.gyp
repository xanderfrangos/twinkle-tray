{
  "targets": [
    {
      "target_name": "wmi_bridge",
      "cflags!": [ ],
      "cflags_cc!": [ ],
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
      'defines': [ 'NAPI_CPP_EXCEPTIONS' ],
    }
  ]
}