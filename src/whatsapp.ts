import makeWASocket, { DisconnectReason, WASocket, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { HttpsProxyAgent } from 'https-proxy-agent';
import qrcode from 'qrcode-terminal';
import { generateQuantumDelay, wait } from './quantum_fuzzing';
import path from 'path';
import 'dotenv/config';
import { useSupabaseAuthState } from './supabaseAuthState';

export interface InstanceInfo {
  instanceId: string;
  clientId: string;
  phone?: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_ready';
  qr: string | null;
  createdAt: Date;
  lastActive?: Date;
}

export class WhatsAppInstance {
  public info: InstanceInfo;
  private sock: WASocket | null = null;
  private retryCount = 0;

  constructor(instanceId: string, clientId: string) {
    this.info = {
      instanceId,
      clientId,
      status: 'disconnected',
      qr: null,
      createdAt: new Date(),
    };
  }

  async connect() {
    this.info.status = 'connecting';
    const authSessionId = `${this.info.clientId}_${this.info.instanceId}`;
    const { state, saveCreds } = await useSupabaseAuthState(authSessionId);

    let version: [number, number, number] | undefined;
    try {
      const { version: v } = await fetchLatestBaileysVersion();
      version = v;
    } catch {
      version = [2, 3000, 1037641644];
    }

    // Proxy (produção)
    let agent: HttpsProxyAgent<string> | undefined;
    if (process.env.USE_PROXY === 'true') {
      const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
      agent = new HttpsProxyAgent(proxyUrl);
    }

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      version,
      browser: Browsers.windows('Chrome'),
      agent,
    });

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.info.qr = qr;
        this.info.status = 'qr_ready';
        this.retryCount = 0;
        console.log(`[${this.info.instanceId}] QR Code generated. Waiting for scan...`);
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          this.retryCount++;
          const delay = Math.min(this.retryCount * 2000, 15000);
          console.log(`[${this.info.instanceId}] Reconnecting in ${delay / 1000}s... (attempt ${this.retryCount})`);
          await wait(delay);
          this.connect();
        } else {
          this.info.status = 'disconnected';
          this.info.qr = null;
          console.log(`[${this.info.instanceId}] Logged out.`);
        }
      } else if (connection === 'open') {
        console.log(`✅ [${this.info.instanceId}] CONNECTED!`);
        this.info.status = 'connected';
        this.info.qr = null;
        this.info.lastActive = new Date();
        this.retryCount = 0;

        // Captura o número do telefone vinculado
        const user = this.sock?.user;
        if (user) {
          this.info.phone = user.id.split(':')[0].split('@')[0];
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async (m) => {
      this.info.lastActive = new Date();
      // TODO: Webhook para o cliente
    });
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
      this.info.status = 'disconnected';
      this.info.qr = null;
    }
  }

  async sendText(to: string, message: string) {
    if (this.info.status !== 'connected' || !this.sock) {
      throw new Error(`Instance ${this.info.instanceId} is not connected.`);
    }

    // Quantum Fuzzing Anti-Ban
    const fuzzing = await generateQuantumDelay();
    console.log(`[${this.info.instanceId}][QF] Delay: ${fuzzing.delayMs}ms | Typing: ${fuzzing.simulatedTypingTimeMs}ms`);
    await wait(fuzzing.delayMs);

    await this.sock.sendPresenceUpdate('composing', to);
    await wait(fuzzing.simulatedTypingTimeMs);
    await this.sock.sendPresenceUpdate('paused', to);

    const result = await this.sock.sendMessage(to, { text: message });
    this.info.lastActive = new Date();
    return result;
  }

  getStatus() {
    return { ...this.info };
  }
}
