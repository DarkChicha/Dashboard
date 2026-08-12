Write-Host "🚀 Iniciando deploy..." -ForegroundColor Cyan

# Swap: pone vite-entry.html como index para el build
Rename-Item index.html landing.html
Rename-Item vite-entry.html index.html

# Build React
Write-Host "⚙️  Compilando React..." -ForegroundColor Yellow
npm run build

# Swap de vuelta: restaura la landing como index
Rename-Item index.html vite-entry.html
Rename-Item landing.html index.html

# Deploy a Firebase
Write-Host "☁️  Subiendo a Firebase..." -ForegroundColor Yellow
firebase deploy

Write-Host "✅ Deploy completado!" -ForegroundColor Green
Write-Host "🌐 https://video-editorial.web.app/" -ForegroundColor Cyan