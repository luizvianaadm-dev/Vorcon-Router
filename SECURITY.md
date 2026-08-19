# 🛡️ Política de Segurança & Conformidade LGPD

> **Organização**: Grupo VORCON (VORCON AIO LTDA)  
> **Contato DPO / Segurança**: `dpo@vorcon-aio.com.br` | `seguranca@vorcon.com.br`

---

## 1. Relato de Vulnerabilidades (Responsible Disclosure)
Levamos a segurança da nossa infraestrutura e dos dados dos nossos clientes com a máxima prioridade. Caso você identifique qualquer vulnerabilidade potencial em nossos sistemas, pedimos que reporte de forma confidencial através do e-mail:

📧 **dpo@vorcon-aio.com.br** ou **seguranca@vorcon.com.br**

Por favor, inclua:
- Descrição detalhada da vulnerabilidade
- Passos para reprodução (Proof of Concept)
- Impacto potencial identificado

Nos comprometemos a responder em até **48 horas úteis** e a manter o pesquisador informado sobre o processo de correção.

---

## 2. Conformidade LGPD (Lei Geral de Proteção de Dados)
- **Princípio da Necessidade e Minimização**: Coletamos e processamos estritamente os dados essenciais para o funcionamento dos serviços.
- **Criptografia e Blindagem**: Todos os dados em trânsito são protegidos via HTTPS / TLS 1.3 com HSTS forçado e cabeçalhos de proteção avançados.
- **AURA Sentinel Active**: Monitoramento ativo contínuo com WAF, proteção contra ataques de injeção e isolamento estrito de dados multi-tenant (*user_id scoping*).

---

## 3. Padrões de Desenvolvimento Seguro (DevSecOps)
- Análise estática contínua de código via **GitHub CodeQL**.
- Varredura automatizada de dependências via **Dependabot**.
- Cabeçalhos HTTP defensivos (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy).
