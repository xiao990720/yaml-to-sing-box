/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import yaml from 'js-yaml';
import { protocolForClash, protocolForSingBox } from './utils/test';
import templateJson from './template.json';

export default function App() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);

  const isValidSubYAML = (str: string) => {
    if (typeof str !== 'string') return false;
    try {
      const parsed = yaml.load(str) as any;
      return !!parsed?.proxies;
    } catch {
      return false;
    }
  };

  const isValidBase64 = (str: string) => {
    try {
      const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
      const decoded = atob(padded);
      return /^(ss|ssr|vmess|vless|trojan|hysteria|hysteria2|tuic|wireguard):\/\//i.test(decoded);
    } catch (err) {
      return false;
    }
  };

  const base64Decode = (str: string) => {
    try {
      const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
      const decoded = atob(padded);
      return decodeURIComponent(escape(decoded));
    } catch (err) {
      try {
        const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
        return atob(padded);
      } catch (err2) {
        return str;
      }
    }
  };

  const processConfig = (proxies: any[], configTemplate: any) => {
    let config = JSON.parse(JSON.stringify(configTemplate));

    // Append proxies to outbounds
    config.outbounds.push(...proxies);

    // Update the 'proxy' selector outbound
    const proxySelector = config.outbounds.find((o: any) => o.tag === 'proxy' && o.type === 'selector');
    if (proxySelector) {
      const proxyTags = proxies.map((p: any) => p.tag);
      proxySelector.outbounds = [...proxyTags, 'direct'];
    }

    return config;
  };

  const convert = () => {
    setStatus(null);
    try {
      const trimmedInput = input.trim();
      if (!trimmedInput) {
        setStatus({ message: '请输入订阅内容', isError: true });
        return;
      }

      let lines: string[] = [];
      let proxies: any[] = [];

      if (isValidSubYAML(trimmedInput)) {
        proxies = (yaml.load(trimmedInput) as any).proxies;
      } else if (isValidBase64(trimmedInput)) {
        const decodedText = base64Decode(trimmedInput);
        lines = decodedText.split('\n').filter((v) => v);
      } else {
        lines = trimmedInput.split('\n').filter((v) => v);
      }

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const schema = line.split('://')[0];
        const protocol = protocolForClash[schema.toLowerCase()];
        if (!protocol) {
          console.log(`未支持的协议：${schema}`);
          continue;
        }
        try {
          const proxy = protocol.parse(line);
          proxies.push(proxy);
        } catch (error) {
          console.log('解析错误：', error);
        }
      }

      if (proxies.length === 0) {
        setStatus({ message: '未能解析出任何有效节点', isError: true });
        return;
      }

      const singbox_proxies: any[] = [];
      const protocolForSingBoxMap = protocolForSingBox();

      for (let proxy of proxies) {
        try {
          const _proxy = protocolForSingBoxMap[proxy.type](proxy);
          singbox_proxies.push(_proxy);
        } catch (error) {
          console.log('转换 SingBox 节点失败', error);
        }
      }

      if (singbox_proxies.length === 0) {
        setStatus({ message: '节点转换失败，请检查输入格式', isError: true });
        return;
      }

      const fullConfig = processConfig(singbox_proxies, templateJson);

      setOutput(JSON.stringify(fullConfig, null, 2));
      setStatus({ message: `成功生成配置，共 ${singbox_proxies.length} 个节点`, isError: false });
    } catch (error: any) {
      console.error('转换失败：', error);
      setStatus({ message: '转换失败：' + error.message, isError: true });
    }
  };

  const copyOutput = () => {
    if (!output) {
      setStatus({ message: '没有可复制的内容', isError: true });
      return;
    }
    navigator.clipboard.writeText(output).then(() => {
      setStatus({ message: '已复制到剪贴板', isError: false });
    }).catch(() => {
      setStatus({ message: '复制失败，请手动复制', isError: true });
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6 font-sans">
      <h2 className="text-2xl font-bold mb-2">Sing-box 完整配置生成器</h2>
      <p className="text-gray-600 mb-6">
        输入 Clash YAML 或 Base64 编码的 v2ray 订阅，生成包含 DNS、路由规则、出站分组的完整 Sing-box 配置。
      </p>

      <textarea
        className="w-full h-48 p-3 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="支持以下格式：
1. Clash YAML 配置
2. Base64 编码的 v2ray 订阅
3. 多行 URI（每行一个节点，支持 ss/ssr/vmess/vless/trojan/hysteria/hysteria2/tuic/wireguard）"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div className="flex gap-4 mb-4">
        <button
          onClick={convert}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          生成完整配置
        </button>
        <button
          onClick={copyOutput}
          className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
        >
          复制结果
        </button>
      </div>

      {status && (
        <div
          className={`p-3 rounded-md mb-4 ${
            status.isError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}
        >
          {status.message}
        </div>
      )}

      <p className="font-bold mb-2">完整 Sing-box 配置</p>
      <textarea
        className="w-full h-96 p-3 border border-gray-300 rounded-md font-mono text-sm bg-gray-50 focus:outline-none"
        readOnly
        value={output}
      />
    </div>
  );
}
