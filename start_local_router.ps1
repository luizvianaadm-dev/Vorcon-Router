# Script para Iniciar o V-Router Localmente e Iniciar a Instância do Aegis

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   INICIANDO V-ROUTER (WHATSAPP GATEWAY) LOCAL" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Abre o servidor do Router em uma nova janela para você ver os logs e o QR Code
Write-Host "1. Iniciando o servidor em uma nova janela..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory $PSScriptRoot

# 2. Aguarda o servidor subir (3 segundos)
Write-Host "2. Aguardando inicialização do servidor..." -ForegroundColor Yellow
Start-Sleep -Seconds 4

# 3. Dispara a criação/inicialização da instância 'vorcon_admin_instance'
Write-Host "3. Inicializando instância 'vorcon_admin_instance'..." -ForegroundColor Yellow
$body = @{
    instanceId = "vorcon_admin_instance"
} | ConvertTo-Json

$headers = @{
    "X-API-KEY" = "vr_founder_vorcon_2026"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/instances" -Method Post -Body $body -ContentType "application/json" -Headers $headers
    Write-Host "✅ Instância inicializada com sucesso!" -ForegroundColor Green
    Write-Host "   Status: $($response.instance.status)" -ForegroundColor Green
    
    if ($response.instance.status -eq "qr_ready") {
        Write-Host ""
        Write-Host "👉 ATENÇÃO: Vá na outra janela do terminal que abriu e ESCANEIE o QR Code com seu WhatsApp!" -ForegroundColor Yellow -BackgroundColor Black
    } else {
        Write-Host "   Aparelho já está conectado e pronto para uso." -ForegroundColor Green
    }
} catch {
    $err = $_.Exception.Message
    if ($_.Exception.Response -ne $null) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $err = $reader.ReadToEnd()
    }
    
    if ($err -like "*already exists*") {
        Write-Host "✅ Instância já estava ativa no servidor." -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao inicializar instância: $err" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "O V-Router está rodando localmente na porta 3000." -ForegroundColor Cyan
Write-Host "Mensagens recebidas no celular conectado serão enviadas para:" -ForegroundColor Gray
Write-Host "https://www.aegisfamily.com/api/webhooks/whatsapp" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Pressione qualquer tecla para fechar este assistente..." -ForegroundColor Yellow
$null = [System.Console]::ReadKey($true)
