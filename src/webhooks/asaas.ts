import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const resend = new Resend(process.env.RESEND_API_KEY);

function generateApiKey() {
  return 'sk_live_' + crypto.randomBytes(32).toString('hex');
}

function generatePassword() {
  return crypto.randomBytes(8).toString('hex');
}

export async function asaasWebhookHandler(req: Request, res: Response) {
  try {
    const token = req.headers['asaas-access-token'];
    
    // 1. Validar Segurança do Webhook
    if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      console.warn('Webhook AsaaS rejeitado: Token inválido.');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { event, payment, customer } = req.body;

    // 2. Filtrar apenas eventos de pagamento confirmado
    if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_RECEIVED') {
      return res.status(200).json({ received: true, message: 'Evento ignorado.' });
    }

    // 3. Extrair e-mail do payload
    // O AsaaS pode enviar o e-mail em lugares diferentes dependendo da configuração.
    const email = req.body?.customerEmail || payment?.customerEmail || req.body?.email || payment?.email;
    
    if (!email) {
      console.error('Webhook AsaaS: E-mail não encontrado no payload', req.body);
      return res.status(200).json({ error: 'E-mail não fornecido no payload, não foi possível ativar a conta.' });
    }

    console.log(`Pagamento confirmado para: ${email}. Iniciando ativação...`);

    // 4. Gerar credenciais
    const tempPassword = generatePassword();
    const apiKey = generateApiKey();
    const plan = 'pro';

    // 5. Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already exists') || authError.message.includes('already registered')) {
        console.log(`O usuário ${email} já existe. Ignorando criação.`);
        return res.status(200).json({ received: true, message: 'Usuário já existe.' });
      }
      throw new Error(`Erro ao criar auth user: ${authError.message}`);
    }

    const userId = authData.user.id;

    // 6. Inserir na tabela de clients
    const { error: dbError } = await supabase
      .from('clients')
      .insert({
        id: userId,
        email: email,
        api_key: apiKey,
        plan: plan,
        status: 'active',
        created_at: new Date().toISOString()
      });

    if (dbError) {
      throw new Error(`Erro ao inserir no banco: ${dbError.message}`);
    }

    // 7. Enviar e-mail de Boas-vindas via Resend
    const { error: emailError } = await resend.emails.send({
      from: 'Vorcon Router <onboarding@vorcon.com.br>',
      to: email,
      subject: 'Bem-vindo ao Vorcon WhatsApp Router! 🚀 Suas credenciais.',
      html: `
        <h2>Pagamento Confirmado!</h2>
        <p>Seja muito bem-vindo ao Vorcon WhatsApp Router. Sua infraestrutura isolada já está pronta para operar.</p>
        
        <h3>Suas Credenciais de Acesso:</h3>
        <ul>
          <li><strong>Painel de Controle:</strong> <a href="https://vorcon-router-landing.vorcon.com.br">Acessar Vault</a></li>
          <li><strong>E-mail:</strong> ${email}</li>
          <li><strong>Senha Temporária:</strong> ${tempPassword}</li>
        </ul>

        <h3>Sua API Key (Guarde em segurança):</h3>
        <p style="background: #1e293b; color: #fff; padding: 10px; border-radius: 5px; font-family: monospace;">
          ${apiKey}
        </p>
        
        <p>Esta chave (X-API-KEY) é o seu passaporte para instanciar máquinas e enviar mensagens de forma programática. Nunca a exponha publicamente.</p>
        
        <br/>
        <p>Atenciosamente,<br/><strong>Equipe Vorcon Tech</strong></p>
      `
    });

    if (emailError) {
      console.error('Erro ao enviar e-mail via Resend:', emailError);
    }

    console.log(`Ativação concluída com sucesso para ${email}!`);
    return res.status(200).json({ success: true, message: 'Ativação processada.' });

  } catch (error: any) {
    console.error('Erro no processamento do Webhook AsaaS:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
