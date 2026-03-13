基于**https://github.com/wynemo/v2ray-to-sing-box**


撰写自用的代理配置转换工具

具体功能：


   1、机场一般都是 v2ray/clash 格式的， 这是一个用于将 v2ray/clash 格式的订阅配置转换为sing-box格式的Web工具。 clash格式为yaml格式 v2ray可以是一行一行的节点信息，也可以是base64的 (不转换规则等配置，只有节点信息) 支持多种代理协议,能够将配置快速转换为sing-box可用的JSON格式。

   
   2、可以自己VLESS配置

   
   3、也可以手动添加 Sing-box JSON 节点

   


   只要有一个节点都能生成配置

   
   手动添加 Sing-box JSON 节点这个部分主要有完整的节点示例，含完整的{}

   
      {
      "type": "vless",
      "tag": " ",
      "server": " ",
      "server_port":  ,
      "uuid": " ",
      "flow": " ",
      "tls": {
        "enabled": true,
        "server_name": " ",
        "utls": {
          "enabled": true,
          "fingerprint": " "
        },
        "reality": {
          "enabled": true,
          "public_key": " ",
          "short_id": " "  
        }

        
      }
    }
