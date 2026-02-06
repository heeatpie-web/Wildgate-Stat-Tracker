param([string]$ImagePath)

# Ensure strictly absolute path
$absPath = (Resolve-Path $ImagePath).Path

# Load Assemblies for Type Resolution
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]

# C# Code Definition
$csharpCode = @"
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json; // Requires Ref
using System.Text;
using System.Threading.Tasks;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;

// JSON Contracts
[System.Runtime.Serialization.DataContract]
public class OcrOutput {
    [System.Runtime.Serialization.DataMember] public string text;
    [System.Runtime.Serialization.DataMember] public List<OcrLine> lines;
}
[System.Runtime.Serialization.DataContract]
public class OcrLine {
    [System.Runtime.Serialization.DataMember] public string text;
    [System.Runtime.Serialization.DataMember] public List<OcrWord> words;
}
[System.Runtime.Serialization.DataContract]
public class OcrWord {
    [System.Runtime.Serialization.DataMember] public string text;
    [System.Runtime.Serialization.DataMember] public OcrBBox bbox;
}
[System.Runtime.Serialization.DataContract]
public class OcrBBox {
    [System.Runtime.Serialization.DataMember] public double x;
    [System.Runtime.Serialization.DataMember] public double y;
    [System.Runtime.Serialization.DataMember] public double w;
    [System.Runtime.Serialization.DataMember] public double h;
}

public class OcrBridge {
    public static string Run(string path) {
        // Run Async Task synchronously
        var t = RunAsync(path);
        t.Wait();
        return t.Result;
    }

    private static async Task<string> RunAsync(string path) {
        var file = await StorageFile.GetFileFromPathAsync(path);
        using (var stream = await file.OpenAsync(FileAccessMode.Read)) {
            var decoder = await BitmapDecoder.CreateAsync(stream);
            var bitmap = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
            
            var engine = OcrEngine.TryCreateFromUserProfileLanguages();
            if (engine == null) engine = OcrEngine.TryCreateFromLanguage(OcrEngine.AvailableRecognizerLanguages.FirstOrDefault());

            if (engine == null) return "{\"error\": \"No OCR Language installed\"}";

            var result = await engine.RecognizeAsync(bitmap);

            var outObj = new OcrOutput {
                text = result.Text,
                lines = new List<OcrLine>()
            };

            foreach (var line in result.Lines) {
                var lineObj = new OcrLine { text = line.Text, words = new List<OcrWord>() };
                foreach (var word in line.Words) {
                    var r = word.BoundingRect;
                    lineObj.words.Add(new OcrWord {
                        text = word.Text,
                        bbox = new OcrBBox { x = r.X, y = r.Y, w = r.Width, h = r.Height }
                    });
                }
                outObj.lines.Add(lineObj);
            }

            var serializer = new DataContractJsonSerializer(typeof(OcrOutput));
            using (var ms = new MemoryStream()) {
                serializer.WriteObject(ms, outObj);
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }
    }
}
"@

# Define Assemblies
# Note: System.Runtime.WindowsRuntime is required for Task<->IAsyncOperation
$refs = @(
    "System.Runtime.WindowsRuntime",
    "System.Runtime.Serialization",
    "C:\Windows\System32\WinMetadata\Windows.Foundation.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Storage.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Graphics.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Media.winmd"
)

try {
    Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies $refs
    $json = [OcrBridge]::Run($absPath)
    Write-Output $json
}
catch {
    $msg = $_.ToString()
    $stack = $_.ScriptStackTrace
    try { $inner = $_.Exception.InnerException.ToString() } catch { $inner = "None" }
    
    $errObj = @{ error = $msg; stack = $stack; inner = $inner }
    Write-Output ($errObj | ConvertTo-Json -Compress)
    exit 1
}
