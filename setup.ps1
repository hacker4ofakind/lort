#Requires -Version 7.4
# Lort setup for PowerShell. Checks what only this machine can know (Docker, git, free ports,
# memory), builds the image, then hands over to the wizard (`lort setup`) inside it.
#
#   ./setup.ps1               set up, or re-run to change your answers
#   ./setup.ps1 --reset-admin set a new admin password
#   ./setup.ps1 --help
#
# The same steps as setup.sh, kept parallel on purpose. ASCII only.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Line {
    param([string[]] $Text = @(''))
    foreach ($t in $Text) { Write-Information -MessageData $t -InformationAction Continue }
}

function Show-Usage {
    Write-Line 'Usage: ./setup.ps1 [--reset-admin]', '',
        '  (no option)     set up Lort, or run again to change your answers',
        '  --reset-admin   set a new password for a dashboard admin',
        '  --help          show this'
}

$mode = 'setup'
switch ($args.Count) {
    0 { }
    1 {
        switch ($args[0]) {
            '--reset-admin' { $mode = 'reset' }
            { $_ -in '-h', '--help' } { Show-Usage; exit 0 }
            default { Show-Usage; exit 1 }
        }
    }
    default { Show-Usage; exit 1 }
}

$os = if ($IsWindows) { 'windows' } elseif ($IsMacOS) { 'mac' } else { 'linux' }

function Get-InstallHint {
    param([string] $Tool)
    $hints = @{
        'docker:linux' = 'curl -fsSL https://get.docker.com | sh'
        'docker:mac' = 'brew install --cask docker   (then open Docker once)'
        'docker:windows' = 'winget install Docker.DockerDesktop'
        'git:linux' = 'sudo apt-get install -y git   (or your system''s package manager)'
        'git:mac' = 'xcode-select --install'
        'git:windows' = 'winget install Git.Git'
    }
    "  Install it with: $($hints["${Tool}:$os"])"
}

# 1. Docker and git.
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Line 'Lort runs in Docker, and Docker isn''t installed yet.',
        '  How to install it: https://docs.docker.com/engine/install/',
        (Get-InstallHint 'docker'), 'Then run ./setup.ps1 again.'
    exit 1
}
$info = docker info 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    if ($info -match 'permission denied') {
        Write-Line 'Docker is installed, but you don''t have permission to use it.',
            '  Add yourself to the docker group: sudo usermod -aG docker "$USER"',
            '  Then sign out and back in, and run ./setup.ps1 again.',
            '  (Docker''s guide: https://docs.docker.com/engine/install/linux-postinstall/)'
    } else {
        $start = if ($os -eq 'linux') { '  Start it with: sudo systemctl start docker' } else { '  Open Docker Desktop and wait until it says it''s running.' }
        Write-Line 'Docker is installed but isn''t running.', $start,
            '  Docker''s docs: https://docs.docker.com/engine/install/', 'Then run ./setup.ps1 again.'
    }
    exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Line 'Setup needs git, and it isn''t installed yet.',
        '  How to install it: https://git-scm.com/downloads',
        (Get-InstallHint 'git'), 'Then run ./setup.ps1 again.'
    exit 1
}

function Test-LortRunning {
    $state = docker inspect -f '{{.State.Running}}' lort 2>$null
    ($LASTEXITCODE -eq 0) -and ("$state".Trim() -eq 'true')
}

# Interactive flags: -it with a terminal, -i for piped input (scripts, coding agents).
$tty = if ([Console]::IsInputRedirected) { '-i' } else { '-it' }

if ($mode -eq 'reset') {
    if (-not (Test-LortRunning)) {
        Write-Line 'Lort isn''t running, so there''s no admin to reset yet.',
            '  Start it with the docker run line setup printed, then run ./setup.ps1 --reset-admin again.',
            '  (docker ps -a shows whether a container named lort exists.)'
        exit 1
    }
    # lort asks for the email and the new password itself: nothing secret goes through here.
    docker exec $tty -u lort lort lort reset-admin
    exit $LASTEXITCODE
}

# 2. Ports 80 and 443: free, or already Lort's (a re-run).
function Test-PortInUse {
    param([int] $Port)
    if (Test-Path env:LORT_TEST_LISTENING) {
        return " $env:LORT_TEST_LISTENING " -like "* $Port *"
    }
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        return $client.ConnectAsync('127.0.0.1', $Port).Wait(500)
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}
function Test-LortHoldsPort {
    param([int] $Port)
    $mapped = docker port lort "$Port/tcp" 2>$null
    ($LASTEXITCODE -eq 0) -and -not [string]::IsNullOrWhiteSpace("$mapped")
}
$portsFree = 'yes'
foreach ($p in 80, 443) {
    if ((Test-PortInUse $p) -and -not (Test-LortHoldsPort $p)) { $portsFree = 'no' }
}

# 3. Memory: building needs about 2.5 GB of RAM and swap together.
$swapRecipe = @(
    '  To add 2 GB of swap on Linux:',
    '    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile',
    '    echo ''/swapfile none swap sw 0 0'' | sudo tee -a /etc/fstab'
)
if ($os -eq 'linux' -and (Test-Path /proc/meminfo)) {
    $kb = 0
    foreach ($line in Get-Content /proc/meminfo) {
        if ($line -match '^(MemTotal|SwapTotal):\s+(\d+)') { $kb += [long] $Matches[2] }
    }
    if ($kb -lt 2500000) {
        Write-Line "This server has $([math]::Floor($kb / 1024)) MB of memory and swap together. Building Lort needs about 2.5 GB."
        Write-Line $swapRecipe
        Write-Line 'Carrying on; if the build runs out of memory, add swap and run ./setup.ps1 again.', ''
    }
}

# 4. .env: created empty and owner-only if it's missing, never emptied if it exists (it holds
# the key to your board's settings). The wizard fills it in.
$envPath = Join-Path (Get-Location).Path '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    $null = New-Item -ItemType File -Path $envPath
    if ($IsWindows) {
        $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        icacls $envPath /inheritance:r /grant:r "${me}:(R,W)" | Out-Null
    } else {
        chmod 600 $envPath
    }
}

# 5. Build.
$version = git describe --tags --always --dirty 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace("$version")) { $version = 'dev' }
$version = "$version".Trim()
Write-Line "Building Lort $version. The first build takes a few minutes."
docker build -t lort --build-arg "LORT_VERSION=$version" . | Out-Host
$code = $LASTEXITCODE
if ($code -eq 137) {
    Write-Line '', 'The build ran out of memory (exit code 137).'
    Write-Line $swapRecipe
    Write-Line 'Then run ./setup.ps1 again.'
    exit 1
} elseif ($code -ne 0) {
    Write-Line "The build stopped (exit code $code). The lines above say why."
    exit 1
}
Write-Line 'Tidying up old Lort images.'
docker image prune -f --filter label=dev.lort.image=1 | Out-Null
try {
    $free = [System.IO.DriveInfo]::new((Get-Location).Path).AvailableFreeSpace
    if ($free -lt 4GB) {
        Write-Line "Heads up: only $([math]::Floor($free / 1MB)) MB of disk is free here. Lort's updates need about 4 GB."
    }
} catch {
    Write-Verbose "Couldn't check free disk space: $_"
}
Write-Line ''

# 6. The wizard.
$containerRunning = if (Test-LortRunning) { 'yes' } else { 'no' }
docker run --rm $tty --entrypoint lort `
    --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER `
    --security-opt no-new-privileges `
    -v "$((Get-Location).Path):/work" -v lort_data:/data `
    lort setup --workdir /work --ports-free=$portsFree --container-running=$containerRunning --os=$os --script=./setup.ps1
exit $LASTEXITCODE
