param([Parameter(Mandatory=$true)][string]$Desktop, [Parameter(Mandatory=$true)][string]$Output,
      [Parameter(Mandatory=$true)][string]$Application, [Parameter(Mandatory=$true)][string]$Name)
# The unsigned installer on Windows: an x64 application, not signed, with the package's version; installed silently, started
# until its window has loaded the bundled page, and uninstalled silently. Writes the installer and package-metadata.json.
$ErrorActionPreference = 'Stop'
$package = Get-Content (Join-Path $Desktop 'package.json') -Raw | ConvertFrom-Json
$products = Join-Path $Desktop 'artifacts'
$evidence = Get-Content (Join-Path $products 'package-evidence.json') -Raw | ConvertFrom-Json
$installerName = "$Application-$($evidence.version)-windows-x64-unsigned.exe"
$installers = @(Get-ChildItem $products -Filter $installerName -File)
if ($installers.Count -ne 1) { throw "Expected installer $installerName in $products" }
$installer = $installers[0]
$app = Join-Path $products "win-unpacked/$Name.exe"
if (!(Test-Path $app)) { throw "Missing packaged application: $app" }
$bytes = [System.IO.File]::ReadAllBytes($app)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
if ([BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x8664) { throw 'Expected an x64 application' }
$signature = Get-AuthenticodeSignature $installer.FullName
if ($signature.Status -ne 'NotSigned') { throw "Unsigned workflow produced unexpected signing state: $($signature.Status)" }
$version = $installer.VersionInfo.ProductVersion
if (!$version -or !$version.StartsWith($evidence.version)) { throw "Installer version mismatch: $version" }
if ($evidence.architecture -ne 'x64' -or $evidence.minimumWindows -ne '10' -or $evidence.electron -ne $package.devDependencies.electron) { throw 'Package evidence mismatch' }

$temp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$target = Join-Path $temp "$Application-installed"
$installed = Start-Process $installer.FullName -ArgumentList '/S', "/D=$target" -Wait -PassThru
if ($installed.ExitCode -ne 0 -or !(Test-Path "$target\$Name.exe")) { throw "Silent install failed with exit $($installed.ExitCode)" }
Start-Process "$target\$Name.exe" -ArgumentList '--remote-debugging-port=9339' | Out-Null
$page = $null
for ($i = 0; $i -lt 90 -and -not $page; $i++) {
  Start-Sleep 1
  try { $page = (Invoke-RestMethod 'http://127.0.0.1:9339/json/list') | Where-Object { $_.type -eq 'page' -and $_.url -like '*://app/index.html*' } | Select-Object -First 1 } catch { }
}
Get-Process $Name -ErrorAction SilentlyContinue | Stop-Process -Force
if (-not $page) { throw 'The installed application did not load its page' }
Start-Sleep 2
Start-Process "$target\Uninstall $Name.exe" -ArgumentList '/S' -Wait | Out-Null
for ($i = 0; $i -lt 30 -and (Test-Path "$target\$Name.exe"); $i++) { Start-Sleep 1 }
if (Test-Path "$target\$Name.exe") { throw 'The silent uninstall left the application' }

Copy-Item $installer.FullName $Output
$metadata = [ordered]@{
  platform = 'windows'; version = $evidence.version; fileName = $installer.Name; format = 'exe'
  architectures = @('x64'); minOsVersion = '10.0'; signing = 'unsigned'
  sha256 = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  size = $installer.Length; electron = $package.devDependencies.electron; page = $page.url
  purpose = 'build-evidence'; distributionReady = $false; nativeInstallerTested = $true
}
$metadata | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Output 'package-metadata.json') -Encoding utf8
"Installed, started ($($page.url)) and uninstalled $($installer.Name)"
