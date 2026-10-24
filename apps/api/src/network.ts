import { networkInterfaces } from 'node:os';
import type { AppConfig } from './config.ts';

// Private LAN address a phone on the same Wi-Fi can reach; Wi-Fi style ranges win over virtual adapters
export function detectLanIp(): string | null {
  const candidates: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) if (nic.family === 'IPv4' && !nic.internal) candidates.push(nic.address);
  }
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 3 : 2);
  return candidates.sort((a, b) => rank(a) - rank(b)).at(0) ?? null;
}

// Base URL encoded in QR codes: the deployed address on the playground, the laptop's LAN address locally
export function publicBaseUrl(config: AppConfig): string {
  if (config.PUBLIC_BASE_URL) return config.PUBLIC_BASE_URL.replace(/\/$/, '');
  const ip = config.LAN_IP ?? detectLanIp() ?? 'localhost';
  const port = config.SERVE_WEB ? config.PORT : config.WEB_PORT;
  return `http://${ip}:${port}`;
}
