import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { instanceManager } from './instanceManager';
import { asaasWebhookHandler } from './webhooks/asaas';

const app = express();
app.use(express.json());

// Enable CORS for frontend integration
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') {
     res.sendStatus(200);
     return;
  }
  next();
});

// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO (API Key no Header)
// ============================================================
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-KEY header.' });
  }

  const client = instanceManager.authenticateClient(apiKey);
  if (!client) {
    return res.status(403).json({ error: 'Invalid API Key.' });
  }

  // Injeta o clientId no request
  (req as any).clientId = client.clientId;
  (req as any).clientPlan = client.plan;
  next();
}

// ============================================================
// ROTAS PÚBLICAS (Health Check)
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    service: 'Vorcon Router',
    status: 'online',
    totalInstances: instanceManager.getTotalCount(),
    uptime: process.uptime(),
  });
});

// ============================================================
// WEBHOOKS (Sem autenticação X-API-KEY)
// ============================================================
app.post('/api/webhooks/asaas', asaasWebhookHandler);

// ============================================================
// ROTAS AUTENTICADAS
// ============================================================
app.use('/api', authMiddleware);

// --- INSTÂNCIAS ---

// Criar nova instância
app.post('/api/instances', async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;
    const clientId = (req as any).clientId;

    if (!instanceId) {
      return res.status(400).json({ error: 'Missing instanceId in body.' });
    }

    const info = await instanceManager.createInstance(clientId, instanceId);
    res.status(201).json({ success: true, instance: info });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Listar minhas instâncias
app.get('/api/instances', (req: Request, res: Response) => {
  const clientId = (req as any).clientId;
  const instances = instanceManager.getClientInstances(clientId);
  res.json({ clientId, count: instances.length, instances });
});

// Status de uma instância específica
app.get('/api/instances/:instanceId/status', (req: Request, res: Response) => {
  const clientId = (req as any).clientId;
  const instance = instanceManager.getInstance(clientId, req.params.instanceId as string);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found.' });
  }
  res.json(instance.getStatus());
});

// QR Code de uma instância (string para renderizar no front)
app.get('/api/instances/:instanceId/qr', (req: Request, res: Response) => {
  const clientId = (req as any).clientId;
  const instance = instanceManager.getInstance(clientId, req.params.instanceId as string);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found.' });
  }
  const status = instance.getStatus();
  if (!status.qr) {
    return res.json({ qr: null, message: status.status === 'connected' ? 'Already connected.' : 'QR not generated yet.' });
  }
  res.json({ qr: status.qr });
});

// Deletar instância
app.delete('/api/instances/:instanceId', async (req: Request, res: Response) => {
  try {
    const clientId = (req as any).clientId;
    await instanceManager.deleteInstance(clientId, req.params.instanceId as string);
    res.json({ success: true, message: 'Instance deleted.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- MENSAGENS ---

// Enviar mensagem de texto
app.post('/api/instances/:instanceId/message/sendText', async (req: Request, res: Response) => {
  try {
    const clientId = (req as any).clientId;
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Missing phone or message.' });
    }

    const instance = instanceManager.getInstance(clientId, req.params.instanceId as string);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found.' });
    }

    const to = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
    const result = await instance.sendText(to, message);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ADMIN (apenas plano founder) ---

app.get('/api/admin/all-instances', (req: Request, res: Response) => {
  const plan = (req as any).clientPlan;
  if (plan !== 'founder') {
    return res.status(403).json({ error: 'Admin access only.' });
  }
  const all = instanceManager.getAllInstances();
  res.json({ totalInstances: all.length, instances: all });
});

// Billing de um cliente
app.get('/api/billing', (req: Request, res: Response) => {
  const clientId = (req as any).clientId;
  const billing = instanceManager.getClientBilling(clientId);
  res.json({ clientId, billing });
});

// Instâncias por produto (admin)
app.get('/api/admin/product/:product', (req: Request, res: Response) => {
  const plan = (req as any).clientPlan;
  if (plan !== 'founder') {
    return res.status(403).json({ error: 'Admin access only.' });
  }
  const product = req.params.product as any;
  const instances = instanceManager.getInstancesByProduct(product);
  res.json({ product, count: instances.length, instances });
});

// ============================================================
// BACKWARD COMPATIBILITY (rota legada do MVP)
// ============================================================
app.post('/message/sendText', async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    // Usa a primeira instância do admin (compatibilidade)
    const adminInstances = instanceManager.getClientInstances('vorcon_admin');
    if (adminInstances.length === 0) {
      return res.status(503).json({ error: 'No active instance. Create one first via POST /api/instances' });
    }

    const instance = instanceManager.getInstance('vorcon_admin', adminInstances[0].instanceId);
    if (!instance) {
      return res.status(503).json({ error: 'Instance not available.' });
    }

    const to = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
    const result = await instance.sendText(to, message);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Vorcon Router Multi-Tenant running on port ${PORT}`);
  console.log(`   Health:    GET  http://localhost:${PORT}/health`);
  console.log(`   Instances: POST http://localhost:${PORT}/api/instances`);
  console.log(`   Send:      POST http://localhost:${PORT}/api/instances/:id/message/sendText`);
  console.log(`\n   Use header X-API-KEY for authentication.\n`);
});
