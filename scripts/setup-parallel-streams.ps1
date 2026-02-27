param(
    [string]$BaseBranch = "main",
    [string]$UiBranch = "stream/ui",
    [string]$OcrBranch = "stream/ocr",
    [string]$ContractBranch = "stream/contract",
    [string]$UiWorktreePath = "..\\wg-ui",
    [string]$OcrWorktreePath = "..\\wg-ocr",
    [string]$ContractWorktreePath = "..\\wg-contract",
    [switch]$IncludeContract
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-BranchExists {
    param([string]$BranchName)
    & git rev-parse --verify --quiet $BranchName | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Ensure-Worktree {
    param(
        [string]$BranchName,
        [string]$Path
    )

    if (Test-Path $Path) {
        Write-Host "Worktree already exists at $Path (branch: $BranchName)"
        return
    }

    if (Test-BranchExists -BranchName $BranchName) {
        Write-Host "Creating worktree $Path on existing branch $BranchName"
        & git worktree add $Path $BranchName
    }
    else {
        Write-Host "Creating worktree $Path and new branch $BranchName from $BaseBranch"
        & git worktree add -b $BranchName $Path $BaseBranch
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create worktree for $BranchName at $Path"
    }
}

Write-Host "Setting up parallel streams..."
Write-Host "Base branch: $BaseBranch"

Ensure-Worktree -BranchName $UiBranch -Path $UiWorktreePath
Ensure-Worktree -BranchName $OcrBranch -Path $OcrWorktreePath

if ($IncludeContract) {
    Ensure-Worktree -BranchName $ContractBranch -Path $ContractWorktreePath
}

Write-Host ""
Write-Host "Done."
Write-Host "UI stream:  $UiWorktreePath ($UiBranch)"
Write-Host "OCR stream: $OcrWorktreePath ($OcrBranch)"
if ($IncludeContract) {
    Write-Host "Contract stream: $ContractWorktreePath ($ContractBranch)"
}
