param(
    [string]$ImagePath
)

# Load .NET/WinRT Interop
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]

function Await-Task($Task) {
    try {
        $Task.Wait()
        if ($Task.IsFaulted) { throw $Task.Exception }
        return $Task.Result
    }
    catch {
        throw $_
    }
}

function Run-Ocr {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) { throw "File not found: $Path" }
    $absPath = (Resolve-Path $Path).Path

    # 1. Get File
    $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($absPath)
    $fileTask = [System.WindowsRuntimeSystemExtensions]::AsTask($fileOp)
    $file = Await-Task $fileTask

    # 2. Open Stream
    $streamOp = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
    $streamTask = [System.WindowsRuntimeSystemExtensions]::AsTask($streamOp)
    $stream = Await-Task $streamTask

    # 3. Create Decoder
    $decoderOp = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
    $decoderTask = [System.WindowsRuntimeSystemExtensions]::AsTask($decoderOp)
    $decoder = Await-Task $decoderTask

    # 4. Get SoftwareBitmap
    $bitmapOp = $decoder.GetSoftwareBitmapAsync()
    $bitmapTask = [System.WindowsRuntimeSystemExtensions]::AsTask($bitmapOp)
    $bitmap = Await-Task $bitmapTask

    # 5. Initialize Engine (Try EN-US, fallback to first available)
    $lang = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Where-Object { $_.LanguageTag -match "en" } | Select-Object -First 1
    if (-not $lang) { $lang = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Select-Object -First 1 }
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
    
    # 6. Recognize
    $ocrOp = $engine.RecognizeAsync($bitmap)
    $ocrTask = [System.WindowsRuntimeSystemExtensions]::AsTask($ocrOp)
    $result = Await-Task $ocrTask

    return $result
}

try {
    $result = Run-Ocr -Path $ImagePath

    # Output JSON
    $output = @{
        text  = $result.Text
        lines = @()
    }

    foreach ($line in $result.Lines) {
        $lineObj = @{
            text  = $line.Text
            words = @()
        }
        foreach ($word in $line.Words) {
            $rect = $word.BoundingRect
            $lineObj.words += @{
                text = $word.Text
                bbox = @{ x = $rect.X; y = $rect.Y; w = $rect.Width; h = $rect.Height }
            }
        }
        $output.lines += $lineObj
    }

    $json = $output | ConvertTo-Json -Depth 5 -Compress
    Write-Output $json

}
catch {
    $err = @{ error = $_.ToString(); stack = $_.ScriptStackTrace }
    Write-Output ($err | ConvertTo-Json -Compress)
    exit 1
}
