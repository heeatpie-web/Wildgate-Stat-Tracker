$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$env:PATH = "C:\cm-bin;$env:PATH"
$env:HOME = $env:USERPROFILE
$env:XDG_DATA_HOME = Join-Path $env:USERPROFILE ".local\\share"
$env:XDG_CONFIG_HOME = Join-Path $env:USERPROFILE ".config"

$cmRoot = Join-Path $scriptDir ".codemachine"
$cmLogs = Join-Path $cmRoot "logs"
$templatePath = Join-Path $cmRoot "template.json"
$registryExportPath = Join-Path $cmLogs "registry-export.json"
$registryDbWal = Join-Path $cmLogs "registry.db-wal"
$registryDbShm = Join-Path $cmLogs "registry.db-shm"

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $raw = Get-Content $Path -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return ($raw | ConvertFrom-Json)
}

function Write-JsonFile {
    param([string]$Path, [object]$Object)
    $json = $Object | ConvertTo-Json -Depth 100
    Set-Content -Path $Path -Value $json
}

function Get-RegistryAgents {
    $registry = Read-JsonFile -Path $registryExportPath
    if (-not $registry -or -not $registry.agents) { return @() }
    $agents = @()
    foreach ($p in $registry.agents.PSObject.Properties) {
        $agents += $p.Value
    }
    return $agents
}

function Get-CodemachineProcesses {
    $cwdPrefix = (Get-Location).Path.ToLowerInvariant()
    $targets = Get-Process | Where-Object {
        $_.ProcessName -in @("node", "electron")
    } | ForEach-Object {
        try {
            $_ | Add-Member -NotePropertyName _Path -NotePropertyValue ($_.Path) -PassThru
        } catch {
            $_ | Add-Member -NotePropertyName _Path -NotePropertyValue "" -PassThru
        }
    } | Where-Object {
        $p = ([string]$($_._Path)).ToLowerInvariant()
        ($p -like "*codemachine*") -or
        ($_.ProcessName -eq "electron" -and $p -like "$cwdPrefix*") -or
        ($_.ProcessName -eq "node" -and $p -like "*node.exe")
    }
    return $targets
}

function Get-StaleAgents {
    $agents = Get-RegistryAgents
    $stale = @()
    $now = Get-Date
    foreach ($a in $agents) {
        $status = [string]$a.status
        $isActive = $status -in @("running", "paused")
        if (-not $isActive) { continue }

        if ($a.endTime) {
            $stale += $a
            continue
        }

        if ($a.startTime) {
            $start = Get-Date $a.startTime
            if (($now - $start).TotalMinutes -gt 15) {
                $stale += $a
            }
        }
    }
    return $stale
}

function Sync-TemplateFromRegistry {
    $template = Read-JsonFile -Path $templatePath
    if (-not $template) { return $false }

    $agents = Get-RegistryAgents
    $agentById = @{}
    foreach ($a in $agents) {
        if ($a.id -ne $null) { $agentById[[string]$a.id] = $a }
    }

    if (-not $template.completedSteps) { return $false }

    $updated = $false
    $pending = @()

    foreach ($stepProp in $template.completedSteps.PSObject.Properties) {
        $stepKey = $stepProp.Name
        $stepData = $stepProp.Value

        if ($stepData.completedAt) { continue }

        $monitoringId = $null
        if ($stepData.monitoringId -ne $null) { $monitoringId = [string]$stepData.monitoringId }

        if ($monitoringId -and $agentById.ContainsKey($monitoringId)) {
            $agent = $agentById[$monitoringId]
            if ($agent.endTime) {
                $stepData | Add-Member -NotePropertyName completedAt -NotePropertyValue ([string]$agent.endTime) -Force
                if (-not $stepData.sessionId -and $agent.sessionId) {
                    $stepData | Add-Member -NotePropertyName sessionId -NotePropertyValue ([string]$agent.sessionId) -Force
                }
                $updated = $true
            } else {
                $pending += [int]$stepKey
            }
        } else {
            $pending += [int]$stepKey
        }
    }

    $template.notCompletedSteps = @($pending | Sort-Object -Unique)
    if ($template.notCompletedSteps.Count -eq 0) {
        $template.resumeFromLastStep = $false
    } else {
        $template.resumeFromLastStep = $true
    }
    $template.lastUpdated = (Get-Date).ToString("o")
    $updated = $true

    if ($updated) {
        Write-JsonFile -Path $templatePath -Object $template
    }
    return $updated
}

function Reset-TemplateProgress {
    $template = Read-JsonFile -Path $templatePath
    if (-not $template -or -not $template.completedSteps) { return $false }

    $allSteps = @()
    foreach ($stepProp in $template.completedSteps.PSObject.Properties) {
        $stepData = $stepProp.Value
        if ($stepData) {
            if ($stepData.PSObject.Properties["completedAt"]) { $stepData.PSObject.Properties.Remove("completedAt") }
            if ($stepData.PSObject.Properties["sessionId"]) { $stepData.PSObject.Properties.Remove("sessionId") }
            if ($stepData.PSObject.Properties["monitoringId"]) { $stepData.PSObject.Properties.Remove("monitoringId") }
        }
        $allSteps += [int]$stepProp.Name
    }

    $template.notCompletedSteps = @($allSteps | Sort-Object -Unique)
    $template.resumeFromLastStep = $false
    $template.lastUpdated = (Get-Date).ToString("o")
    Write-JsonFile -Path $templatePath -Object $template
    return $true
}

function Invoke-CodemachineDoctor {
    Write-Output "[doctor] workspace: $((Get-Location).Path)"
    Write-Output "[doctor] template exists: $(Test-Path $templatePath)"
    Write-Output "[doctor] registry-export exists: $(Test-Path $registryExportPath)"

    $procs = Get-CodemachineProcesses
    Write-Output "[doctor] candidate processes: $($procs.Count)"
    foreach ($p in $procs) {
        Write-Output ("  - PID {0} {1} {2}" -f $p.Id, $p.ProcessName, $p._Path)
    }

    Write-Output "[doctor] lock files:"
    Write-Output ("  - {0}: {1}" -f $registryDbWal, (Test-Path $registryDbWal))
    Write-Output ("  - {0}: {1}" -f $registryDbShm, (Test-Path $registryDbShm))

    $stale = Get-StaleAgents
    Write-Output "[doctor] stale agents: $($stale.Count)"
    foreach ($a in $stale) {
        Write-Output ("  - id={0} name={1} status={2} start={3} end={4}" -f $a.id, $a.name, $a.status, $a.startTime, $a.endTime)
    }

    $template = Read-JsonFile -Path $templatePath
    if ($template) {
        $pending = @()
        if ($template.notCompletedSteps) { $pending = @($template.notCompletedSteps) }
        Write-Output "[doctor] template pending steps: $($pending -join ', ')"
        Write-Output "[doctor] resumeFromLastStep: $($template.resumeFromLastStep)"
    }
}

function Invoke-CodemachineReset {
    Write-Output "[reset] stopping stale runner processes..."
    $procs = Get-CodemachineProcesses
    foreach ($p in $procs) {
        try {
            Stop-Process -Id $p.Id -Force -ErrorAction Stop
            Write-Output ("  - stopped PID {0} ({1})" -f $p.Id, $p.ProcessName)
        } catch {
            Write-Output ("  - failed PID {0}: {1}" -f $p.Id, $_.Exception.Message)
        }
    }

    foreach ($f in @($registryDbWal, $registryDbShm)) {
        if (Test-Path $f) {
            Remove-Item $f -Force
            Write-Output ("[reset] removed {0}" -f $f)
        } else {
            Write-Output ("[reset] missing {0}" -f $f)
        }
    }

    $templateReset = Reset-TemplateProgress
    Write-Output ("[reset] template progress reset: {0}" -f $templateReset)
}

function Invoke-CodemachineFinalize {
    $synced = Sync-TemplateFromRegistry
    Write-Output ("[finalize] template sync: {0}" -f $synced)
}

function Invoke-CodemachineProgress {
    $agents = Get-RegistryAgents | Sort-Object id
    if ($agents.Count -eq 0) {
        Write-Output "[progress] no agents found in registry-export"
        return
    }

    foreach ($a in $agents) {
        Write-Output ("[{0}] {1} status={2} start={3} end={4}" -f $a.id, $a.name, $a.status, $a.startTime, $a.endTime)
        if ($a.logPath) {
            $logPath = Join-Path $scriptDir ([string]$a.logPath).Replace("/", "\")
            if (Test-Path $logPath) {
                $tail = Get-Content $logPath -Tail 2
                foreach ($line in $tail) {
                    Write-Output ("    {0}" -f $line)
                }
            }
        }
    }
}

function Invoke-CodemachinePreflight {
    $errors = @()

    $mustExist = @(
        "PLAN.md",
        ".codemachine\inputs\specification.md",
        ".codemachine\inputs\specifications.md",
        "electron\geminiService.cjs"
    )

    foreach ($m in $mustExist) {
        if (-not (Test-Path (Join-Path $scriptDir $m))) {
            $errors += "Missing required file: $m"
        }
    }

    $electronFiles = Get-ChildItem -Path (Join-Path $scriptDir "electron") -Filter *.cjs -File -ErrorAction SilentlyContinue
    foreach ($f in $electronFiles) {
        $content = Get-Content $f.FullName -Raw
        $matches = [regex]::Matches($content, "require\(['""](\./[^'""]+)['""]\)")
        foreach ($m in $matches) {
            $rel = $m.Groups[1].Value
            $resolved = Join-Path $f.DirectoryName $rel
            if (-not (Test-Path $resolved) -and -not (Test-Path "$resolved.cjs") -and -not (Test-Path "$resolved.js")) {
                $errors += "Missing local require target in $($f.Name): $rel"
            }
        }
    }

    if ($errors.Count -gt 0) {
        Write-Output "[preflight] FAILED"
        foreach ($e in $errors) { Write-Output ("  - {0}" -f $e) }
        exit 1
    }

    Write-Output "[preflight] OK"
}

if ($args.Count -gt 0) {
    $cmd = [string]$args[0]
    switch ($cmd) {
        "doctor" {
            Invoke-CodemachineDoctor
            exit 0
        }
        "reset" {
            Invoke-CodemachineReset
            exit 0
        }
        "finalize" {
            Invoke-CodemachineFinalize
            exit 0
        }
        "progress" {
            Invoke-CodemachineProgress
            exit 0
        }
        "preflight" {
            Invoke-CodemachinePreflight
            exit 0
        }
    }
}

& codemachine @args
