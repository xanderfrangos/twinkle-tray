{
  "targets": [
    {
      "target_name": "windows-hdr",
      "cflags!": [ ],
      "cflags_cc!": [ ],
      "conditions": [
        ["OS=='win'", {
      	  "sources": [ "windows-hdr.cc" ]
      	}],
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_CPP_EXCEPTIONS' ],
    }
  ]
}