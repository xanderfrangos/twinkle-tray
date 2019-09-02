{
    "targets": [{
        "target_name": "ddcci"
      , "sources": [ "./ddcci.cc" ]
      , "include_dirs": [ "<!@(node -p \"require('node-addon-api').include\")" ]
      , "dependencies": [ "<!(node -p \"require('node-addon-api').gyp\")" ]
      , "msvs_settings": {
            "VCCLCompilerTool": {
                "ExceptionHandling": 1
            }
        }
      , "libraries": [ "dxva2.lib" ]
    }]
}