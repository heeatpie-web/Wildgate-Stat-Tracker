using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;
using System.Collections.Generic;
using System.Runtime.Serialization.Json;
using System.Text;

// Minimal JSON structures
[System.Runtime.Serialization.DataContract]
class OcrOutput {
    [System.Runtime.Serialization.DataMember] public string text;
    [System.Runtime.Serialization.DataMember] public List<OcrLine> lines;
}
[System.Runtime.Serialization.DataContract]
class OcrLine {
    [System.Runtime.Serialization.DataMember] public string text;
    [System.Runtime.Serialization.DataMember] public List<OcrWord> words;
}
[System.Runtime.Serialization.DataContract]
class OcrWord {
    [System.Runtime.Serialization.DataMember] public string text;
    [System.Runtime.Serialization.DataMember] public OcrBBox bbox;
}
[System.Runtime.Serialization.DataContract]
class OcrBBox {
    [System.Runtime.Serialization.DataMember] public double x;
    [System.Runtime.Serialization.DataMember] public double y;
    [System.Runtime.Serialization.DataMember] public double w;
    [System.Runtime.Serialization.DataMember] public double h;
}

class Program {
    static void Main(string[] args) {
        if (args.Length == 0) {
            Console.Error.WriteLine("Usage: ocr.exe <image_path>");
            return;
        }

        string path = Path.GetFullPath(args[0]);
        if (!File.Exists(path)) {
            Console.Error.WriteLine(string.Format("File not found: {0}", path));
            return;
        }

        try {
            RunAsync(path).Wait();
        } catch (Exception ex) {
            Console.Error.WriteLine(string.Format("Error: {0}", ex.Message));
            if (ex.InnerException != null) {
                Console.Error.WriteLine(string.Format("Inner: {0}", ex.InnerException.Message));
            }
            // Console.Error.WriteLine(ex.StackTrace);
        }
    }

    static async Task RunAsync(string path) {
        var file = await StorageFile.GetFileFromPathAsync(path);
        using (var stream = await file.OpenAsync(FileAccessMode.Read)) {
            var decoder = await BitmapDecoder.CreateAsync(stream);
            // Ensure we get a SoftwareBitmap that represents the pixel data correctly
            var bitmap = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
            
            // OCR Engine
            var engine = OcrEngine.TryCreateFromUserProfileLanguages();
            if (engine == null) engine = OcrEngine.TryCreateFromLanguage(OcrEngine.AvailableRecognizerLanguages.FirstOrDefault());

            if (engine == null) {
                Console.Error.WriteLine("No OCR language available.");
                return;
            }

            var result = await engine.RecognizeAsync(bitmap);

            // Build Output
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

            // Serialize JSON
            var serializer = new DataContractJsonSerializer(typeof(OcrOutput));
            using (var ms = new MemoryStream()) {
                serializer.WriteObject(ms, outObj);
                Console.WriteLine(Encoding.UTF8.GetString(ms.ToArray()));
            }
        }
    }
}
