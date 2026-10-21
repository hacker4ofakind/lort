# Smoke tests for setup.ps1 with a fake docker and git on a PATH that has nothing else of note.
#   Invoke-Pester test/wrapper.Tests.ps1     (Pester 5.7)
# Nothing real is built, run or touched.

BeforeAll {
    $script:Source = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, '..', 'setup.ps1'))
    $script:Pwsh = (Get-Process -Id $PID).Path

    # One fake for both tools. It logs each call as tool|arg|arg... and acts on FAKE_* variables.
    $script:FakeScript = @'
$tool = $env:FAKE_TOOL_NAME
Add-Content -LiteralPath $env:FAKE_LOG -Value (@($tool) + $args -join '|')
if ($tool -eq 'git') {
    if ($args[0] -eq 'describe' -and $env:FAKE_GIT_VERSION) { $env:FAKE_GIT_VERSION; exit 0 }
    exit 128
}
switch ($args[0]) {
    'info' {
        if ($env:FAKE_INFO -eq 'down') { [Console]::Error.WriteLine('Cannot connect to the Docker daemon. Is the docker daemon running?'); exit 1 }
        if ($env:FAKE_INFO -eq 'denied') { [Console]::Error.WriteLine('permission denied while trying to connect to the Docker daemon socket'); exit 1 }
    }
    'inspect' {
        if ($env:FAKE_RUNNING) { 'true'; exit 0 }
        if ($env:FAKE_STOPPED) { 'false'; exit 0 }
        exit 1
    }
    'port' { if ($env:FAKE_LORT_PORTS) { "0.0.0.0:$($args[2])" } }
    'build' { if ($env:FAKE_BUILD_CODE) { exit [int] $env:FAKE_BUILD_CODE } }
    'run' {
        $envFile = Join-Path (Get-Location).Path '.env'
        if (Test-Path -LiteralPath $envFile) {
            if ($IsWindows) {
                # Compare SIDs, not names: account names come in more than one spelling.
                $acl = Get-Acl -LiteralPath $envFile
                $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
                $sids = @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value })
                $private = $acl.AreAccessRulesProtected -and $sids.Count -eq 1 -and $sids[0] -eq $me.Value
                $detail = "protected=$($acl.AreAccessRulesProtected) aces=$(@($acl.Access | ForEach-Object { "$($_.IdentityReference):$($_.FileSystemRights)" }) -join ',') me=$($me.Value)"
            } else {
                $mode = (Get-Item -Force -LiteralPath $envFile).UnixFileMode
                $private = $mode -eq ([System.IO.UnixFileMode] 'UserRead, UserWrite')
                $detail = "mode=$mode"
            }
            Add-Content -LiteralPath $env:FAKE_LOG -Value "env-at-wizard size=$((Get-Item -Force -LiteralPath $envFile).Length) private=$private"
            if (-not $private) { Add-Content -LiteralPath $env:FAKE_LOG -Value "env-acl $detail" }
        }
    }
}
exit 0
'@

    function Build-FakeBin {
        param([string] $Dir, [string[]] $Tools)
        $null = New-Item -ItemType Directory -Path $Dir
        $fake = Join-Path $Dir 'fake.ps1'
        Set-Content -LiteralPath $fake -Value $script:FakeScript
        foreach ($t in $Tools) {
            if ($IsWindows) {
                Set-Content -LiteralPath (Join-Path $Dir "$t.cmd") -Value "@echo off`r`nset FAKE_TOOL_NAME=$t`r`n`"$script:Pwsh`" -NoProfile -NonInteractive -File `"$fake`" %*`r`nexit /b %ERRORLEVEL%`r`n"
            } else {
                $path = Join-Path $Dir $t
                Set-Content -LiteralPath $path -Value "#!/bin/sh`nFAKE_TOOL_NAME=$t exec '$script:Pwsh' -NoProfile -NonInteractive -File '$fake' `"`$@`"`n"
                chmod +x $path
            }
        }
        if (-not $IsWindows) { # the only other tool setup.ps1 uses on Unix
            $null = New-Item -ItemType SymbolicLink -Path (Join-Path $Dir 'chmod') -Target (Get-Command chmod -CommandType Application | Select-Object -First 1).Source
        }
    }

    function Invoke-Setup {
        param(
            [string[]] $Arguments = @(),
            [hashtable] $Fake = @{},
            [switch] $NoDocker,
            [switch] $NoGit,
            [string] $ExistingEnv
        )
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) "lort-wrapper-$([guid]::NewGuid())"
        $work = Join-Path $dir 'work'
        $null = New-Item -ItemType Directory -Path $work
        $tools = @()
        if (-not $NoDocker) { $tools += 'docker' }
        if (-not $NoGit) { $tools += 'git' }
        Build-FakeBin -Dir (Join-Path $dir 'bin') -Tools $tools
        Copy-Item $script:Source (Join-Path $work 'setup.ps1')
        if ($PSBoundParameters.ContainsKey('ExistingEnv')) { Set-Content -LiteralPath (Join-Path $work '.env') -Value $ExistingEnv -NoNewline }
        $log = Join-Path $dir 'calls.log'
        $null = New-Item -ItemType File -Path $log

        $saved = @{ PATH = $env:PATH }
        foreach ($k in 'INFO', 'RUNNING', 'STOPPED', 'LORT_PORTS', 'BUILD_CODE', 'GIT_VERSION', 'LOG') { $saved["FAKE_$k"] = [Environment]::GetEnvironmentVariable("FAKE_$k") }
        # Only the fakes: System32 can hold a real docker.exe (it does on GitHub's Windows runners),
        # and setup.ps1 calls icacls by its full path.
        $env:PATH = Join-Path $dir 'bin'
        $env:FAKE_LOG = $log
        $env:FAKE_INFO = $Fake['Info']
        $env:FAKE_RUNNING = $(if ($Fake['Running']) { '1' })
        $env:FAKE_STOPPED = $(if ($Fake['Stopped']) { '1' })
        $env:FAKE_LORT_PORTS = $(if ($Fake['LortPorts']) { '1' })
        $env:FAKE_BUILD_CODE = $Fake['BuildCode']
        $env:FAKE_GIT_VERSION = $Fake['GitVersion']
        Push-Location $work
        try {
            $out = & $script:Pwsh -NoProfile -NonInteractive -File ./setup.ps1 @Arguments 2>&1 | Out-String
            $code = $LASTEXITCODE
        } finally {
            Pop-Location
            foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
        }
        $calls = @(Get-Content -LiteralPath $log)
        $envAfter = if (Test-Path -LiteralPath (Join-Path $work '.env')) { Get-Content -LiteralPath (Join-Path $work '.env') -Raw } else { $null }
        Remove-Item -LiteralPath $dir -Recurse -Force
        [pscustomobject]@{ Out = $out; Code = $code; Calls = $calls; Env = $envAfter }
    }
}

Describe 'setup.ps1' {
    BeforeAll { $env:LORT_TEST_LISTENING = 'none' }
    AfterAll { Remove-Item env:LORT_TEST_LISTENING -ErrorAction SilentlyContinue }

    It 'explains a missing Docker with the link and install line' {
        $r = Invoke-Setup -NoDocker
        $r.Code | Should -Be 1
        $r.Out | Should -Match 'isn''t installed'
        $r.Out | Should -Match 'https://docs.docker.com/engine/install/'
        $r.Out | Should -Match 'Install it with'
    }

    It 'explains a Docker that is not running' {
        $r = Invoke-Setup -Fake @{ Info = 'down' }
        $r.Code | Should -Be 1
        $r.Out | Should -Match 'isn''t running'
        $r.Out | Should -Match 'docs.docker.com'
    }

    It 'gives socket permission its own message' {
        $r = Invoke-Setup -Fake @{ Info = 'denied' }
        $r.Code | Should -Be 1
        $r.Out | Should -Match 'usermod -aG docker'
        $r.Out | Should -Not -Match 'isn''t installed'
    }

    It 'explains a missing git with the link and install line' {
        $r = Invoke-Setup -NoGit
        $r.Code | Should -Be 1
        $r.Out | Should -Match 'https://git-scm.com/downloads'
        $r.Out | Should -Match 'Install it with'
    }

    Context 'a normal run' {
        BeforeAll { $script:Run = Invoke-Setup }

        It 'builds with LORT_VERSION=dev when there is no tag' {
            $script:Run.Code | Should -Be 0
            $script:Run.Calls | Should -Contain 'docker|build|-t|lort|--build-arg|LORT_VERSION=dev|.'
        }

        It 'runs the wizard with the exact mounts, entrypoint and flags' {
            $wizard = @($script:Run.Calls | Where-Object { $_ -like 'docker|run|*' })
            $wizard.Count | Should -Be 1
            $wizard[0] | Should -BeLike 'docker|run|--rm|-i|--entrypoint|lort|--cap-drop=ALL|--cap-add=CHOWN|--cap-add=SETUID|--cap-add=SETGID|--cap-add=DAC_OVERRIDE|--cap-add=FOWNER|--security-opt|no-new-privileges|-v|*:/work|-v|lort_data:/data|lort|setup|--workdir|/work|--ports-free=yes|--container-running=no|--container-exists=no|--os=*'
        }

        It 'makes .env empty and owner-only before the wizard runs' {
            $seen = @($script:Run.Calls | Where-Object { $_ -like 'env-a*' }) -join ' / '
            $seen | Should -Be 'env-at-wizard size=0 private=True'
        }

        It 'prunes only old Lort images' {
            $script:Run.Calls | Should -Contain 'docker|image|prune|-f|--filter|label=dev.lort.image=1'
        }
    }

    It 'never empties an existing .env' {
        $r = Invoke-Setup -ExistingEnv "LORT_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz012345`n"
        $r.Env | Should -Match 'abcdefghijklmnopqrstuvwxyz012345'
    }

    It 'passes git describe as the version' {
        $r = Invoke-Setup -Fake @{ GitVersion = 'v1.2.0-3-gabc' }
        $r.Calls | Should -Contain 'docker|build|-t|lort|--build-arg|LORT_VERSION=v1.2.0-3-gabc|.'
    }

    It 'gives --ports-free=no when a port is taken' {
        $env:LORT_TEST_LISTENING = '80'
        try { $r = Invoke-Setup } finally { $env:LORT_TEST_LISTENING = 'none' }
        ($r.Calls -join "`n") | Should -Match '--ports-free=no'
    }

    It 'counts ports held by the lort container as free' {
        $env:LORT_TEST_LISTENING = '80 443'
        try { $r = Invoke-Setup -Fake @{ LortPorts = $true; Running = $true } } finally { $env:LORT_TEST_LISTENING = 'none' }
        ($r.Calls -join "`n") | Should -Match '--ports-free=yes\|--container-running=yes\|--container-exists=yes'
    }

    It 'reports a stopped lort container as existing but not running' {
        $r = Invoke-Setup -Fake @{ Stopped = $true }
        ($r.Calls -join "`n") | Should -Match '--container-running=no\|--container-exists=yes'
    }

    It 'explains exit code 137 as running out of memory' {
        $r = Invoke-Setup -Fake @{ BuildCode = '137' }
        $r.Code | Should -Be 1
        $r.Out | Should -Match 'ran out of memory'
        $r.Out | Should -Match 'swapfile'
        @($r.Calls | Where-Object { $_ -like 'docker|run|*' }).Count | Should -Be 0
    }

    It '--reset-admin checks the container is running first' {
        $r = Invoke-Setup -Arguments '--reset-admin'
        $r.Code | Should -Be 1
        $r.Out | Should -Match 'isn''t running'
        @($r.Calls | Where-Object { $_ -like 'docker|exec|*' }).Count | Should -Be 0
    }

    It '--reset-admin runs docker exec with nothing secret in argv' {
        $r = Invoke-Setup -Arguments '--reset-admin' -Fake @{ Running = $true }
        @($r.Calls | Where-Object { $_ -like 'docker|exec|*' }) | Should -Be @('docker|exec|-i|-u|lort|lort|lort|reset-admin')
    }

    It '--help shows the options and builds nothing' {
        $r = Invoke-Setup -Arguments '--help'
        $r.Code | Should -Be 0
        $r.Out | Should -Match '--reset-admin'
        @($r.Calls | Where-Object { $_ -like 'docker|build|*' }).Count | Should -Be 0
    }

    It 'is pure ASCII' {
        $bytes = [System.IO.File]::ReadAllBytes($script:Source)
        @($bytes | Where-Object { $_ -gt 127 }).Count | Should -Be 0
    }
}
