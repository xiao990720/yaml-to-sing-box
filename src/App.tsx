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

  const [vlessNode, setVlessNode] = useState({
    enabled: false,
    tag: 'Manual-VLESS',
    server: '',
    server_port: 443,
    uuid: '',
    network: 'tcp',
    tls: 'none',
    sni: '',
    flow: '',
    pbk: '',
    sid: '',
    path: '/',
    host: '',
    serviceName: ''
  });

  const [singboxNodeInput, setSingboxNodeInput] = useState('');
  const [enableSingboxInput, setEnableSingboxInput] = useState(false);

  const handleVlessChange = (field: string, value: any) => {
    setVlessNode(prev => ({ ...prev, [field]: value }));
  };

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
      const hasManualVless = vlessNode.enabled && vlessNode.server && vlessNode.uuid;

      let manualSingboxNodes: any[] = [];
      if (enableSingboxInput && singboxNodeInput.trim()) {
        try {
          const parsed = JSON.parse(singboxNodeInput.trim());
          if (Array.isArray(parsed)) {
            manualSingboxNodes = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            manualSingboxNodes = [parsed];
          }
        } catch (e) {
          setStatus({ message: 'Sing-box JSON 节点解析失败，请检查 JSON 格式', isError: true });
          return;
        }
      }
      const hasSingboxNodes = manualSingboxNodes.length > 0;

      if (!trimmedInput && !hasManualVless && !hasSingboxNodes) {
        setStatus({ message: '请输入订阅内容或填写手动节点', isError: true });
        return;
      }

      let lines: string[] = [];
      let proxies: any[] = [];

      if (trimmedInput) {
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
      }

      if (proxies.length === 0 && !hasManualVless && !hasSingboxNodes) {
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

      if (hasManualVless) {
        const manualVless: any = {
          type: 'vless',
          tag: vlessNode.tag || 'Manual-VLESS',
          server: vlessNode.server,
          server_port: Number(vlessNode.server_port),
          uuid: vlessNode.uuid,
        };

        if (vlessNode.flow) {
          manualVless.flow = vlessNode.flow;
        }

        if (vlessNode.tls !== 'none') {
          manualVless.tls = {
            enabled: true,
            server_name: vlessNode.sni || vlessNode.server,
            utls: {
              enabled: true,
              fingerprint: 'chrome'
            }
          };
          if (vlessNode.tls === 'reality') {
            manualVless.tls.reality = {
              enabled: true,
              public_key: vlessNode.pbk,
              short_id: vlessNode.sid
            };
          }
        }

        if (vlessNode.network === 'ws') {
          manualVless.transport = {
            type: 'ws',
            path: vlessNode.path,
          };
          if (vlessNode.host) {
            manualVless.transport.headers = { Host: vlessNode.host };
          }
        } else if (vlessNode.network === 'grpc') {
          manualVless.transport = {
            type: 'grpc',
            service_name: vlessNode.serviceName
          };
        }

        singbox_proxies.push(manualVless);
      }

      if (hasSingboxNodes) {
        singbox_proxies.push(...manualSingboxNodes);
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

      <div className="mb-6 border border-gray-300 rounded-md p-4 bg-white">
        <label className="flex items-center space-x-2 font-bold mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={vlessNode.enabled}
            onChange={(e) => handleVlessChange('enabled', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span>手动添加 VLESS 节点</span>
        </label>

        {vlessNode.enabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">节点名称 (Tag)</label>
              <input type="text" value={vlessNode.tag} onChange={e => handleVlessChange('tag', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">服务器地址 (Server)</label>
              <input type="text" value={vlessNode.server} onChange={e => handleVlessChange('server', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">端口 (Port)</label>
              <input type="number" value={vlessNode.server_port} onChange={e => handleVlessChange('server_port', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm text-gray-700 mb-1">UUID</label>
              <input type="text" value={vlessNode.uuid} onChange={e => handleVlessChange('uuid', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">传输协议 (Network)</label>
              <select value={vlessNode.network} onChange={e => handleVlessChange('network', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="tcp">TCP</option>
                <option value="ws">WebSocket</option>
                <option value="grpc">gRPC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">TLS 安全</label>
              <select value={vlessNode.tls} onChange={e => handleVlessChange('tls', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="none">None</option>
                <option value="tls">TLS</option>
                <option value="reality">REALITY</option>
              </select>
            </div>
            {vlessNode.tls !== 'none' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">SNI (Server Name)</label>
                <input type="text" value={vlessNode.sni} onChange={e => handleVlessChange('sni', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}
            {vlessNode.tls === 'reality' && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-700 mb-1">Public Key (PBK)</label>
                  <input type="text" value={vlessNode.pbk} onChange={e => handleVlessChange('pbk', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Short ID (SID)</label>
                  <input type="text" value={vlessNode.sid} onChange={e => handleVlessChange('sid', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </>
            )}
            {vlessNode.network === 'tcp' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">Flow (流控)</label>
                <input type="text" placeholder="例如: xtls-rprx-vision" value={vlessNode.flow} onChange={e => handleVlessChange('flow', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}
            {vlessNode.network === 'ws' && (
              <>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">WebSocket Path</label>
                  <input type="text" value={vlessNode.path} onChange={e => handleVlessChange('path', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">WebSocket Host</label>
                  <input type="text" value={vlessNode.host} onChange={e => handleVlessChange('host', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </>
            )}
            {vlessNode.network === 'grpc' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">gRPC Service Name</label>
                <input type="text" value={vlessNode.serviceName} onChange={e => handleVlessChange('serviceName', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-6 border border-gray-300 rounded-md p-4 bg-white">
        <label className="flex items-center space-x-2 font-bold mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={enableSingboxInput}
            onChange={(e) => setEnableSingboxInput(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span>手动添加 Sing-box JSON 节点</span>
        </label>

        {enableSingboxInput && (
          <div>
            <textarea
              className="w-full h-32 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder='例如: {"type": "vless", "tag": "my-node", "server": "1.1.1.1", ...}&#10;支持单个 JSON 对象或对象数组 []'
              value={singboxNodeInput}
              onChange={(e) => setSingboxNodeInput(e.target.value)}
            />
          </div>
        )}
      </div>

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
