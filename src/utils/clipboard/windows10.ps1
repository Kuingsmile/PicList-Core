param($imagePath)

[console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding

Add-Type -Assembly PresentationCore
function main {
    $img = [Windows.Clipboard]::GetImage()

    if ($null -eq $img) {
        "no image"
        Exit 1
    }

    if (-not $imagePath) {
        "no image"
        Exit 1
    }

    $fcb = new-object Windows.Media.Imaging.FormatConvertedBitmap($img, [Windows.Media.PixelFormats]::Rgb24, $null, 0)
    $stream = [IO.File]::Open($imagePath, "OpenOrCreate")
    $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($fcb)) | out-null
    $encoder.Save($stream) | out-null
    $stream.Dispose() | out-null

    $imagePath
    Exit 1
}

try {
    $file = Get-Clipboard -Format FileDropList
    if ($null -ne $file) {
        Convert-Path $file
        Exit 1
    }
} catch {
    main
}

main