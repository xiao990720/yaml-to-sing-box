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

  const [manualNode, setManualNode] = useState({
    enabled: false,
    type: 'vless',
    tag: 'Manual-Node',
    server: '',
    server_port: 443,
    
    // ss / ssr
    method: 'aes-128-gcm',
    password: '',
    obfs: '',
    obfs_param: '',
    protocol: '',
    protocol_param: '',
    
    // vmess / vless / tuic
    uuid: '',
    alter_id: 0,
    security: 'auto',
    
    // vless
    flow: '',
    
    // hysteria
    up_mbps: 0,
    down_mbps: 0,
    auth_str: '',
    
    // wireguard
    local_address: '',
    private_key: '',
    peer_public_key: '',
    pre_shared_key: '',
    mtu: 1420,
    
    // transport & tls (vmess, vless, trojan)
    network: 'tcp',
    tls: 'none',
    sni: '',
    pbk: '',
    sid: '',
    path: '/',
    host: '',
    serviceName: ''
  });

  const [singboxNodeInput, setSingboxNodeInput] = useState('');
  const [enableSingboxInput, setEnableSingboxInput] = useState(false);

  const [subLink, setSubLink] = useState({ enabled: false, url: '' });

  const handleManualNodeChange = (field: string, value: any) => {
    setManualNode(prev => ({ ...prev, [field]: value }));
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

  const parseTextToProxies = (text: string) => {
    let parsedProxies: any[] = [];
    let lines: string[] = [];
    if (isValidSubYAML(text)) {
      parsedProxies = (yaml.load(text) as any).proxies || [];
      return parsedProxies;
    } else if (isValidBase64(text)) {
      const decodedText = base64Decode(text);
      lines = decodedText.split('\n').filter((v) => v);
    } else {
      lines = text.split('\n').filter((v) => v);
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
        parsedProxies.push(proxy);
      } catch (error) {
        console.log('解析错误：', error);
      }
    }
    return parsedProxies;
  };

  const convert = async () => {
    setStatus(null);
    try {
      const trimmedInput = input.trim();
      const hasManualNode = manualNode.enabled && manualNode.server;
      const hasSubLink = subLink.enabled && subLink.url.trim();

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

      if (!trimmedInput && !hasManualNode && !hasSingboxNodes && !hasSubLink) {
        setStatus({ message: '请输入订阅内容、链接或填写手动节点', isError: true });
        return;
      }

      let proxies: any[] = [];

      if (trimmedInput) {
        proxies.push(...parseTextToProxies(trimmedInput));
      }

      if (hasSubLink) {
        setStatus({ message: '正在获取订阅链接...', isError: false });
        let fetchedText = '';
        try {
          const res = await fetch(subLink.url.trim());
          if (!res.ok) throw new Error('Network error');
          fetchedText = await res.text();
        } catch (err) {
          try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(subLink.url.trim())}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error('Proxy error');
            fetchedText = await res.text();
          } catch (proxyErr) {
            setStatus({ message: '获取订阅链接失败，请检查链接或网络', isError: true });
            return;
          }
        }
        if (fetchedText) {
          proxies.push(...parseTextToProxies(fetchedText.trim()));
        }
      }

      if (proxies.length === 0 && !hasManualNode && !hasSingboxNodes) {
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

      if (hasManualNode) {
        let node: any = {
          type: manualNode.type === 'ss' ? 'shadowsocks' : manualNode.type === 'ssr' ? 'shadowsocksr' : manualNode.type,
          tag: manualNode.tag || 'Manual-Node',
          server: manualNode.server,
          server_port: Number(manualNode.server_port),
        };

        if (['ss', 'ssr'].includes(manualNode.type)) {
          node.method = manualNode.method;
          node.password = manualNode.password;
          if (manualNode.type === 'ssr') {
            node.obfs = manualNode.obfs;
            node.obfs_param = manualNode.obfs_param;
            node.protocol = manualNode.protocol;
            node.protocol_param = manualNode.protocol_param;
          }
        }

        if (['vmess', 'vless', 'tuic'].includes(manualNode.type)) {
          node.uuid = manualNode.uuid;
        }

        if (manualNode.type === 'vmess') {
          node.security = manualNode.security;
          node.alter_id = Number(manualNode.alter_id);
        }

        if (manualNode.type === 'vless') {
          if (manualNode.flow) node.flow = manualNode.flow;
        }

        if (['trojan', 'tuic', 'hysteria2'].includes(manualNode.type)) {
          node.password = manualNode.password;
        }

        if (manualNode.type === 'hysteria') {
          node.up_mbps = Number(manualNode.up_mbps);
          node.down_mbps = Number(manualNode.down_mbps);
          node.auth_str = manualNode.auth_str;
          if (manualNode.sni) node.server_name = manualNode.sni;
        }

        if (manualNode.type === 'hysteria2') {
          if (manualNode.sni) node.server_name = manualNode.sni;
          if (manualNode.obfs) {
            node.obfs = {
              type: 'salamander',
              password: manualNode.obfs
            };
          }
        }

        if (manualNode.type === 'tuic') {
          if (manualNode.sni) node.server_name = manualNode.sni;
        }

        if (manualNode.type === 'wireguard') {
          node.local_address = manualNode.local_address.split(',').map((s: string) => s.trim()).filter(Boolean);
          node.private_key = manualNode.private_key;
          node.peer_public_key = manualNode.peer_public_key;
          if (manualNode.pre_shared_key) node.pre_shared_key = manualNode.pre_shared_key;
          if (manualNode.mtu) node.mtu = Number(manualNode.mtu);
        }

        // TLS & Transport for vmess, vless, trojan
        if (['vmess', 'vless', 'trojan'].includes(manualNode.type)) {
          if (manualNode.tls !== 'none') {
            node.tls = {
              enabled: true,
              server_name: manualNode.sni || manualNode.server,
              utls: {
                enabled: true,
                fingerprint: 'chrome'
              }
            };
            if (manualNode.tls === 'reality') {
              node.tls.reality = {
                enabled: true,
                public_key: manualNode.pbk,
                short_id: manualNode.sid
              };
            }
          }

          if (manualNode.network === 'ws') {
            node.transport = {
              type: 'ws',
              path: manualNode.path,
            };
            if (manualNode.host) {
              node.transport.headers = { Host: manualNode.host };
            }
          } else if (manualNode.network === 'grpc') {
            node.transport = {
              type: 'grpc',
              service_name: manualNode.serviceName
            };
          }
        }

        singbox_proxies.push(node);
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
            checked={subLink.enabled}
            onChange={(e) => setSubLink({ ...subLink, enabled: e.target.checked })}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span>输入订阅链接</span>
        </label>

        {subLink.enabled && (
          <div>
            <input
              type="text"
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如: https://example.com/api/v1/client/subscribe?token=xxx"
              value={subLink.url}
              onChange={(e) => setSubLink({ ...subLink, url: e.target.value })}
            />
          </div>
        )}
      </div>

      <div className="mb-6 border border-gray-300 rounded-md p-4 bg-white">
        <label className="flex items-center space-x-2 font-bold mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={manualNode.enabled}
            onChange={(e) => handleManualNodeChange('enabled', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span>手动添加节点</span>
        </label>

        {manualNode.enabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">节点类型 (Type)</label>
              <select value={manualNode.type} onChange={e => handleManualNodeChange('type', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="vless">VLESS</option>
                <option value="vmess">VMess</option>
                <option value="trojan">Trojan</option>
                <option value="ss">Shadowsocks</option>
                <option value="ssr">ShadowsocksR</option>
                <option value="hysteria">Hysteria</option>
                <option value="hysteria2">Hysteria2</option>
                <option value="tuic">TUIC</option>
                <option value="wireguard">WireGuard</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">节点名称 (Tag)</label>
              <input type="text" value={manualNode.tag} onChange={e => handleManualNodeChange('tag', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">服务器地址 (Server)</label>
              <input type="text" value={manualNode.server} onChange={e => handleManualNodeChange('server', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">端口 (Port)</label>
              <input type="number" value={manualNode.server_port} onChange={e => handleManualNodeChange('server_port', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            {/* UUID for vmess, vless, tuic */}
            {['vmess', 'vless', 'tuic'].includes(manualNode.type) && (
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-700 mb-1">UUID</label>
                <input type="text" value={manualNode.uuid} onChange={e => handleManualNodeChange('uuid', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}

            {/* Password for ss, ssr, trojan, tuic, hysteria2 */}
            {['ss', 'ssr', 'trojan', 'tuic', 'hysteria2'].includes(manualNode.type) && (
              <div className={['ss', 'ssr'].includes(manualNode.type) ? '' : 'md:col-span-2'}>
                <label className="block text-sm text-gray-700 mb-1">密码 (Password)</label>
                <input type="text" value={manualNode.password} onChange={e => handleManualNodeChange('password', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}

            {/* Method for ss, ssr */}
            {['ss', 'ssr'].includes(manualNode.type) && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">加密方式 (Method)</label>
                <input type="text" value={manualNode.method} onChange={e => handleManualNodeChange('method', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}

            {/* SSR specific */}
            {manualNode.type === 'ssr' && (
              <>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">混淆 (Obfs)</label>
                  <input type="text" value={manualNode.obfs} onChange={e => handleManualNodeChange('obfs', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">混淆参数 (Obfs Param)</label>
                  <input type="text" value={manualNode.obfs_param} onChange={e => handleManualNodeChange('obfs_param', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">协议 (Protocol)</label>
                  <input type="text" value={manualNode.protocol} onChange={e => handleManualNodeChange('protocol', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">协议参数 (Protocol Param)</label>
                  <input type="text" value={manualNode.protocol_param} onChange={e => handleManualNodeChange('protocol_param', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </>
            )}

            {/* VMess specific */}
            {manualNode.type === 'vmess' && (
              <>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">额外ID (Alter ID)</label>
                  <input type="number" value={manualNode.alter_id} onChange={e => handleManualNodeChange('alter_id', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">加密方式 (Security)</label>
                  <select value={manualNode.security} onChange={e => handleManualNodeChange('security', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="auto">auto</option>
                    <option value="aes-128-gcm">aes-128-gcm</option>
                    <option value="chacha20-poly1305">chacha20-poly1305</option>
                    <option value="none">none</option>
                  </select>
                </div>
              </>
            )}

            {/* Hysteria specific */}
            {manualNode.type === 'hysteria' && (
              <>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">上行速度 (Up Mbps)</label>
                  <input type="number" value={manualNode.up_mbps} onChange={e => handleManualNodeChange('up_mbps', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">下行速度 (Down Mbps)</label>
                  <input type="number" value={manualNode.down_mbps} onChange={e => handleManualNodeChange('down_mbps', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">认证字符串 (Auth Str)</label>
                  <input type="text" value={manualNode.auth_str} onChange={e => handleManualNodeChange('auth_str', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </>
            )}

            {/* Hysteria2 specific */}
            {manualNode.type === 'hysteria2' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">混淆密码 (Obfs Password)</label>
                <input type="text" value={manualNode.obfs} onChange={e => handleManualNodeChange('obfs', e.target.value)} placeholder="留空则不启用" className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}

            {/* WireGuard specific */}
            {manualNode.type === 'wireguard' && (
              <>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">本地地址 (Local Address)</label>
                  <input type="text" value={manualNode.local_address} onChange={e => handleManualNodeChange('local_address', e.target.value)} placeholder="如 10.0.0.2/32, 逗号分隔" className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">私钥 (Private Key)</label>
                  <input type="text" value={manualNode.private_key} onChange={e => handleManualNodeChange('private_key', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">对端公钥 (Peer Public Key)</label>
                  <input type="text" value={manualNode.peer_public_key} onChange={e => handleManualNodeChange('peer_public_key', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">预共享密钥 (Pre-shared Key)</label>
                  <input type="text" value={manualNode.pre_shared_key} onChange={e => handleManualNodeChange('pre_shared_key', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">MTU</label>
                  <input type="number" value={manualNode.mtu} onChange={e => handleManualNodeChange('mtu', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </>
            )}

            {/* Transport & TLS (vmess, vless, trojan) */}
            {['vmess', 'vless', 'trojan'].includes(manualNode.type) && (
              <>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">传输协议 (Network)</label>
                  <select value={manualNode.network} onChange={e => handleManualNodeChange('network', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="tcp">TCP</option>
                    <option value="ws">WebSocket</option>
                    <option value="grpc">gRPC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">TLS 安全</label>
                  <select value={manualNode.tls} onChange={e => handleManualNodeChange('tls', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="none">None</option>
                    <option value="tls">TLS</option>
                    <option value="reality">REALITY</option>
                  </select>
                </div>
              </>
            )}

            {/* SNI for tls, reality, hysteria, hysteria2, tuic */}
            {((['vmess', 'vless', 'trojan'].includes(manualNode.type) && manualNode.tls !== 'none') || ['hysteria', 'hysteria2', 'tuic'].includes(manualNode.type)) && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">SNI (Server Name)</label>
                <input type="text" value={manualNode.sni} onChange={e => handleManualNodeChange('sni', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}

            {/* REALITY specific */}
            {['vmess', 'vless', 'trojan'].includes(manualNode.type) && manualNode.tls === 'reality' && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-700 mb-1">Public Key (PBK)</label>
                  <input type="text" value={manualNode.pbk} onChange={e => handleManualNodeChange('pbk', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Short ID (SID)</label>
                  <input type="text" value={manualNode.sid} onChange={e => handleManualNodeChange('sid', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </>
            )}

            {/* VLESS TCP Flow */}
            {manualNode.type === 'vless' && manualNode.network === 'tcp' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">Flow (流控)</label>
                <input type="text" placeholder="例如: xtls-rprx-vision" value={manualNode.flow} onChange={e => handleManualNodeChange('flow', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}

            {/* WebSocket specific */}
            {['vmess', 'vless', 'trojan'].includes(manualNode.type) && manualNode.network === 'ws' && (
              <>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">WebSocket Path</label>
                  <input type="text" value={manualNode.path} onChange={e => handleManualNodeChange('path', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">WebSocket Host</label>
                  <input type="text" value={manualNode.host} onChange={e => handleManualNodeChange('host', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </>
            )}

            {/* gRPC specific */}
            {['vmess', 'vless', 'trojan'].includes(manualNode.type) && manualNode.network === 'grpc' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">gRPC Service Name</label>
                <input type="text" value={manualNode.serviceName} onChange={e => handleManualNodeChange('serviceName', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
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
