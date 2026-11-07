$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deliveryRoot = Join-Path $projectRoot '.sites-runtime/delivery-v09'
New-Item -ItemType Directory -Path $deliveryRoot -Force | Out-Null
$sourceRoot = Join-Path $deliveryRoot 'source'
New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null
$imageFiles = @('app/image-upload.tsx','app/images.css','lib/images.ts','worker/hosted-platform.js','scripts/preview-hosted.mjs','tests/hosted.test.mjs','drizzle/0001_public_views.sql','README-HOSTING.md')
foreach ($relative in $imageFiles) {
  $to = Join-Path $sourceRoot $relative
  New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot $relative) -Destination $to -Force
}
$files = @('app/company-access.tsx','app/company-portal.tsx','lib/company-access.ts','worker/company-portal.js','worker/save-workspace.js','drizzle/0006_company_memberships.sql','tests/company-access.test.mjs','app/personal-photo.tsx','lib/recover-drafts.ts','lib/workspace-media.ts','worker/workspace-media.js','worker/photo-pixels.js','drizzle/0005_workspace_images.sql','tests/media-save.test.mjs','app/personal-customers.tsx','worker/admin-customers.js','tests/admin-customers.test.mjs','app/personal-access.tsx','worker/personal-access.js','drizzle/0004_personal_access.sql','tests/personal-access.test.mjs','app/personal-editor.tsx','app/foundation-panel.tsx','app/personal.css','lib/personal.ts','worker/personal.js','worker/customer-foundation.js','drizzle/0003_customer_foundation.sql','tests/customer-foundation.test.mjs','tests/team-access.test.mjs','app/team-access.tsx','lib/access.ts','drizzle/0002_team_access.sql','tests/profile-import.test.ts','app/profile-import.tsx','lib/profile-import.ts','lib/brand.ts','package.json','tsconfig.json','README-PLATFORM.md','.gitignore','.openai/hosting.json','app/entry.tsx','app/workspace.tsx','app/card-view.tsx','app/studio.css','lib/model.ts','lib/qr.ts','worker/platform.js','scripts/build-platform.mjs','scripts/preview-platform.mjs','tests/model.test.ts','tests/platform.test.mjs','tests/offline-html.test.py','db/schema.ts','drizzle/0000_workspace.sql','drizzle/meta/_journal.json','dist/server/index.js','dist/.openai/hosting.json')
foreach ($relative in $files) {
  $from = Join-Path $projectRoot $relative
  $to = Join-Path $sourceRoot $relative
  New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $from -Destination $to -Force
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'offline-demo/START-HERE.html') -Destination (Join-Path $deliveryRoot 'START-HERE.html') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README-PLATFORM.md') -Destination (Join-Path $deliveryRoot 'READ-ME.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README-HOSTING.md') -Destination (Join-Path $deliveryRoot 'READ-ME.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'licenses') -Destination (Join-Path $sourceRoot 'licenses') -Recurse -Force
$output = Join-Path $projectRoot '../../deliverables/Ascend-Digital-Cards-v0.9.zip'
Compress-Archive -Path (Join-Path $deliveryRoot '*') -DestinationPath $output -Force
Get-Item -LiteralPath $output | Select-Object FullName,Length
