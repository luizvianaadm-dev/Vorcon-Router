import { WhatsAppInstance, InstanceInfo } from './whatsapp';

/**
 * Gerenciador Multi-Tenant de Instâncias WhatsApp
 * 
 * Hierarquia:
 *   Produto (AEGIS, ENGAGE, Router SaaS)
 *     └─ Cliente (tenant)
 *         └─ Instância(s) WhatsApp
 * 
 * Cada produto da Vorcon que usa WhatsApp registra seus 
 * clientes aqui. O limite de instâncias é controlado pelo plano.
 */

export type PlanType = 'trial' | 'pro' | 'enterprise' | 'founder';
export type ProductType = 'aegis' | 'engage' | 'router_saas' | 'internal';

export interface ClientConfig {
  clientId: string;
  apiKey: string;
  product: ProductType;
  plan: PlanType;
  maxInstances: number;
  email?: string;
  billingActive: boolean;
}

// ============================================================
// CLIENTES REGISTRADOS (futuro: migrar para Supabase)
// ============================================================
const REGISTERED_CLIENTS: ClientConfig[] = [
  // ---- VORCON INTERNAL (Founder - Ilimitado) ----
  {
    clientId: 'vorcon_admin',
    apiKey: 'vr_founder_vorcon_2026',
    product: 'internal',
    plan: 'founder',
    maxInstances: 999,
    email: 'luizviana.adm@gmail.com',
    billingActive: false, // Founder não paga
  },
  {
    clientId: 'vorcon_corp',
    apiKey: 'vr_founder_corp_2026',
    product: 'internal',
    plan: 'founder',
    maxInstances: 999,
    email: 'luizviana@vorcon.com.br',
    billingActive: false,
  },

  // ---- AEGIS FAMILY (clientes do produto AEGIS) ----
  // Exemplo: cada família que assina o AEGIS ganha 1 instância
  // {
  //   clientId: 'aegis_familia_silva',
  //   apiKey: 'vr_aegis_silva_xyz123',
  //   product: 'aegis',
  //   plan: 'pro',
  //   maxInstances: 1,     // 1 instância inclusa no plano AEGIS
  //   email: 'silva@email.com',
  //   billingActive: true,
  // },

  // ---- VORCON ENGAGE (clientes do CRM/Marketing) ----
  // Exemplo: empresas que usam o ENGAGE para marketing
  // {
  //   clientId: 'engage_loja_abc',
  //   apiKey: 'vr_engage_abc_def456',
  //   product: 'engage',
  //   plan: 'pro',
  //   maxInstances: 3,     // Plano Pro do ENGAGE = até 3 instâncias
  //   email: 'contato@lojaabc.com',
  //   billingActive: true,
  // },

  // ---- ROUTER SAAS (clientes diretos da landing page) ----
  // Exemplo: dev que assinou pelo site R$ 89,90
  // {
  //   clientId: 'saas_dev_joao',
  //   apiKey: 'vr_pro_joao_ghi789',
  //   product: 'router_saas',
  //   plan: 'pro',
  //   maxInstances: 1,     // 1 instância inclusa
  //   email: 'joao@startup.com',
  //   billingActive: true,
  // },
];

// ============================================================
// TABELA DE PREÇOS POR PRODUTO E PLANO
// ============================================================
export const PRICING: Record<ProductType, Record<PlanType, { basePrice: number; extraInstancePrice: number; includedInstances: number }>> = {
  aegis: {
    trial: { basePrice: 0, extraInstancePrice: 0, includedInstances: 0 },
    pro: { basePrice: 89.90, extraInstancePrice: 29.90, includedInstances: 1 },
    enterprise: { basePrice: 349.90, extraInstancePrice: 19.90, includedInstances: 5 },
    founder: { basePrice: 0, extraInstancePrice: 0, includedInstances: 999 },
  },
  engage: {
    trial: { basePrice: 0, extraInstancePrice: 0, includedInstances: 0 },
    pro: { basePrice: 89.90, extraInstancePrice: 29.90, includedInstances: 1 },
    enterprise: { basePrice: 799.90, extraInstancePrice: 14.90, includedInstances: 10 },
    founder: { basePrice: 0, extraInstancePrice: 0, includedInstances: 999 },
  },
  router_saas: {
    trial: { basePrice: 0, extraInstancePrice: 0, includedInstances: 1 },
    pro: { basePrice: 89.90, extraInstancePrice: 29.90, includedInstances: 1 },
    enterprise: { basePrice: 499.90, extraInstancePrice: 19.90, includedInstances: 10 },
    founder: { basePrice: 0, extraInstancePrice: 0, includedInstances: 999 },
  },
  internal: {
    trial: { basePrice: 0, extraInstancePrice: 0, includedInstances: 0 },
    pro: { basePrice: 0, extraInstancePrice: 0, includedInstances: 999 },
    enterprise: { basePrice: 0, extraInstancePrice: 0, includedInstances: 999 },
    founder: { basePrice: 0, extraInstancePrice: 0, includedInstances: 999 },
  },
};

class InstanceManager {
  private instances: Map<string, WhatsAppInstance> = new Map();

  // Valida API Key e retorna o cliente
  authenticateClient(apiKey: string): ClientConfig | null {
    return REGISTERED_CLIENTS.find(c => c.apiKey === apiKey) || null;
  }

  private makeKey(clientId: string, instanceId: string): string {
    return `${clientId}::${instanceId}`;
  }

  // Cria nova instância para um cliente
  async createInstance(clientId: string, instanceId: string): Promise<InstanceInfo> {
    const client = REGISTERED_CLIENTS.find(c => c.clientId === clientId);
    if (!client) throw new Error('Client not found.');

    // Verifica limite de instâncias do plano
    const clientInstances = this.getClientInstances(clientId);
    if (clientInstances.length >= client.maxInstances) {
      const pricing = PRICING[client.product][client.plan];
      throw new Error(
        `Limite de instâncias atingido (${client.maxInstances}). ` +
        `Instâncias adicionais custam R$ ${pricing.extraInstancePrice.toFixed(2)}/mês. ` +
        `Faça upgrade do seu plano.`
      );
    }

    const key = this.makeKey(clientId, instanceId);
    if (this.instances.has(key)) {
      throw new Error(`Instance '${instanceId}' already exists.`);
    }

    const instance = new WhatsAppInstance(instanceId, clientId);
    this.instances.set(key, instance);
    await instance.connect();

    return instance.getStatus();
  }

  getInstance(clientId: string, instanceId: string): WhatsAppInstance | null {
    return this.instances.get(this.makeKey(clientId, instanceId)) || null;
  }

  getClientInstances(clientId: string): InstanceInfo[] {
    const result: InstanceInfo[] = [];
    for (const [key, instance] of this.instances) {
      if (key.startsWith(`${clientId}::`)) {
        result.push(instance.getStatus());
      }
    }
    return result;
  }

  // Calcula o custo mensal de um cliente
  getClientBilling(clientId: string): { basePrice: number; extraInstances: number; extraCost: number; totalMonthly: number } | null {
    const client = REGISTERED_CLIENTS.find(c => c.clientId === clientId);
    if (!client) return null;

    const pricing = PRICING[client.product][client.plan];
    const totalInstances = this.getClientInstances(clientId).length;
    const extraInstances = Math.max(0, totalInstances - pricing.includedInstances);

    return {
      basePrice: pricing.basePrice,
      extraInstances,
      extraCost: extraInstances * pricing.extraInstancePrice,
      totalMonthly: pricing.basePrice + (extraInstances * pricing.extraInstancePrice),
    };
  }

  // Lista por produto (para dashboards admin)
  getInstancesByProduct(product: ProductType): InstanceInfo[] {
    const productClients = REGISTERED_CLIENTS.filter(c => c.product === product).map(c => c.clientId);
    return Array.from(this.instances.values())
      .filter(i => productClients.includes(i.getStatus().clientId))
      .map(i => i.getStatus());
  }

  getAllInstances(): InstanceInfo[] {
    return Array.from(this.instances.values()).map(i => i.getStatus());
  }

  async deleteInstance(clientId: string, instanceId: string): Promise<void> {
    const key = this.makeKey(clientId, instanceId);
    const instance = this.instances.get(key);
    if (!instance) throw new Error('Instance not found.');
    await instance.disconnect();
    this.instances.delete(key);
  }

  getTotalCount(): number {
    return this.instances.size;
  }
}

export const instanceManager = new InstanceManager();
