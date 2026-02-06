try {
    # Load WinRT Types
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
    
    # Create a dummy async op
    $path = "C:\Windows\System32\notepad.exe"
    $op = [Windows.Storage.StorageFile]::GetFileFromPathAsync($path)
    
    Write-Host "Type: $($op.GetType().FullName)"
    
    Write-Host "`n--- MEMBERS ---"
    $op | Get-Member | Select-Object Name, MemberType | Format-Table -AutoSize
    
    Write-Host "`n--- TRYING TO ACCESS ---"
    # Try reflection to find GetResults
    $method = $op.GetType().GetMethod("GetResults")
    if ($method) {
        Write-Host "Found GetResults method via reflection!"
    }
    else {
        Write-Host "Method GetResults NOT found via reflection."
    }

}
catch {
    Write-Error $_
}
