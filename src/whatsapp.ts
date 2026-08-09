import makeWASocket, { DisconnectReason, WASocket, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { HttpsProxyAgent } from 'https-proxy-agent';
import qrcode from 'qrcode-terminal';
import { generateQuantumDelay, wait } from './quantum_fuzzing';
import path from 'path';
import 'dotenv/config';
import { useSupabaseAuthState } from './supabaseAuthState';
import axios from 'axios';

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
        const errorMsg = lastDisconnect?.error?.message || '';
        const isConflict = errorMsg.includes('conflict') || errorMsg.includes('Stream Errored (conflict)');
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !isConflict;

        if (isConflict) {
          console.error(`🚫 [${this.info.instanceId}] CONFLITO DETECTADO: Outra sessão está usando este número. Parando reconexão.`);
          this.info.status = 'disconnected';
          this.info.qr = null;
          this.retryCount = 0;
        } else if (shouldReconnect && this.retryCount < 5) {
          this.retryCount++;
          const delay = Math.min(this.retryCount * 2000, 15000);
          console.log(`[${this.info.instanceId}] Reconnecting in ${delay / 1000}s... (attempt ${this.retryCount}/5)`);
          await wait(delay);
          this.connect();
        } else if (this.retryCount >= 5) {
          console.error(`🚫 [${this.info.instanceId}] Máximo de tentativas (5) atingido. Parando reconexão.`);
          this.info.status = 'disconnected';
          this.info.qr = null;
          this.retryCount = 0;
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
      
      if (m.type === 'notify') {
        // Dynamic import to avoid circular dependency with instanceManager
        const { instanceManager } = require('./instanceManager');

        for (const msg of m.messages) {
          // Ignora mensagens de GRUPOS — AURA só monitora conversas diretas (1-a-1)
          const remoteJid = msg.key.remoteJid || '';
          if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) {
            continue;
          }

          // Ignora mensagens sem conteúdo ou mensagens de controle/protocolo
          const messageContent = msg.message;
          if (!messageContent) continue;

          if (
            messageContent.protocolMessage || 
            messageContent.senderKeyDistributionMessage ||
            (messageContent as any).peerDataOperationRequestMessage
          ) {
            console.log(`[Webhook] Ignorando mensagem de controle/protocolo (${Object.keys(messageContent).join(', ')}) na instância '${this.info.instanceId}'`);
            continue;
          }

          // Determina se é mensagem do dono ou de terceiro
          const isOwner = !!msg.key.fromMe;

          // Find client config by clientId
          const clientConfig = instanceManager.getClientConfig(this.info.clientId);
          
          if (clientConfig && clientConfig.webhookUrl) {
            const direction = isOwner ? '📤 Resposta do dono' : '📥 Nova mensagem';
            console.log(`[Webhook] ${direction} na instância '${this.info.instanceId}'. Roteando para ${clientConfig.webhookUrl}`);
            
            try {
              await axios.post(clientConfig.webhookUrl, {
                key: {
                  remoteJid: msg.key.remoteJid
                },
                message: msg.message,
                pushName: msg.pushName,
                fromMe: isOwner,  // Flag para AURA saber quem mandou
              }, {
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': clientConfig.apiKey
                },
                timeout: 10000
              });
              console.log(`[Webhook] Sucesso ao enviar para ${clientConfig.webhookUrl}`);
            } catch (error: any) {
              console.error(`[Webhook Error] Falha ao enviar para ${clientConfig.webhookUrl}:`, error.message);
            }
          }
        }
      }
    });
  }

  async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (err) {
        console.warn(`[${this.info.instanceId}] Error logging out:`, err);
      }
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

  async getGroups() {
    if (this.info.status !== 'connected' || !this.sock) {
      throw new Error(`Instance ${this.info.instanceId} is not connected.`);
    }
    const groups = await this.sock.groupFetchAllParticipating();
    return Object.values(groups);
  }

  async getGroupParticipants(groupId: string) {
    if (this.info.status !== 'connected' || !this.sock) {
      throw new Error(`Instance ${this.info.instanceId} is not connected.`);
    }
    const metadata = await this.sock.groupMetadata(groupId);
    return metadata.participants;
  }

  getStatus() {
    return { ...this.info };
  }
}
