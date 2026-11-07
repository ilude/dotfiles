<#
.SYNOPSIS
Capture the visible pixels of one verified T3 Code main window without activating it.
.DESCRIPTION
Requires Windows and an unobscured, non-minimized window wholly on the desktop.
Returns the PNG path, process identity, handle and physical-pixel bounds. If several
T3 main windows exist, pass -ProcessId and/or -WindowHandle to select exactly one.
CopyFromScreen includes overlapping windows; inspect the PNG before using it as evidence.
#>
[CmdletBinding()]
param(
    [int] $ProcessId,
    [long] $WindowHandle,
    [string] $OutputPath
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This helper requires Windows.' }

Add-Type -AssemblyName System.Drawing, System.Windows.Forms
if (-not ('T3WindowCapture.Native' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
namespace T3WindowCapture {
    public static class Native {
        public delegate bool EnumWindowProc(IntPtr hwnd, IntPtr lparam);
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowProc callback, IntPtr lparam);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
        [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        public static IntPtr[] Windows() {
            var windows = new List<IntPtr>();
            EnumWindows((hwnd, unused) => { windows.Add(hwnd); return true; }, IntPtr.Zero);
            return windows.ToArray();
        }
        public static string Title(IntPtr hwnd) {
            var text = new StringBuilder(1024);
            GetWindowText(hwnd, text, text.Capacity);
            return text.ToString();
        }
    }
}
'@
}

$candidates = @(
    foreach ($hwnd in [T3WindowCapture.Native]::Windows()) {
        if ($WindowHandle -and $hwnd.ToInt64() -ne $WindowHandle) { continue }
        if (-not [T3WindowCapture.Native]::IsWindowVisible($hwnd)) { continue }
        $title = [T3WindowCapture.Native]::Title($hwnd)
        if ($title -notin @('T3 Code', 'T3 Code (Nightly)')) { continue }
        [uint32] $ownerId = 0
        [void] [T3WindowCapture.Native]::GetWindowThreadProcessId($hwnd, [ref] $ownerId)
        if ($ProcessId -and $ownerId -ne $ProcessId) { continue }
        $process = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
        if (-not $process -or -not $process.Path) { continue }
        if ([IO.Path]::GetFileName($process.Path) -notin @('T3 Code.exe', 'T3 Code (Nightly).exe')) { continue }
        [pscustomobject] @{
            ProcessId = $ownerId
            ExecutablePath = $process.Path
            Title = $title
            WindowHandle = $hwnd.ToInt64()
        }
    }
)
if ($candidates.Count -ne 1) {
    $identities = $candidates | ConvertTo-Json -Compress
    throw "Expected exactly one visible T3 main window, found $($candidates.Count). Select -ProcessId and/or -WindowHandle. Candidates: $identities"
}
$target = $candidates[0]
$hwnd = [IntPtr] $target.WindowHandle
if ([T3WindowCapture.Native]::IsIconic($hwnd)) { throw 'The selected T3 window is minimized.' }

# Scope DPI awareness to this thread so bounds and copied pixels use the same units.
$previousDpi = [T3WindowCapture.Native]::SetThreadDpiAwarenessContext([IntPtr] (-4))
if ($previousDpi -eq [IntPtr]::Zero) { throw 'Could not establish physical-pixel DPI awareness.' }
$bitmap = $null
$graphics = $null
try {
    $rect = New-Object T3WindowCapture.Native+RECT
    if (-not [T3WindowCapture.Native]::GetWindowRect($hwnd, [ref] $rect)) {
        throw 'GetWindowRect failed for the selected T3 window.'
    }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if ($width -le 1 -or $height -le 1) { throw 'The selected T3 window has unusable bounds.' }
    $bounds = [Drawing.Rectangle]::new($rect.Left, $rect.Top, $width, $height)
    if (-not [Windows.Forms.SystemInformation]::VirtualScreen.Contains($bounds)) {
        throw 'The selected T3 window is not wholly on the visible desktop.'
    }
    if (-not $OutputPath) {
        $OutputPath = Join-Path ([IO.Path]::GetTempPath()) ("t3code-window-{0}.png" -f [guid]::NewGuid().ToString('N'))
    }
    $OutputPath = [IO.Path]::GetFullPath($OutputPath)
    if ([IO.Path]::GetExtension($OutputPath) -ine '.png') { throw 'OutputPath must end in .png.' }
    $bitmap = [Drawing.Bitmap]::new($width, $height)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    $bitmap.Save($OutputPath, [Drawing.Imaging.ImageFormat]::Png)
    [pscustomobject] @{
        Path = $OutputPath
        CapturedAt = [DateTimeOffset]::Now.ToString('o')
        ProcessId = $target.ProcessId
        ExecutablePath = $target.ExecutablePath
        Title = $target.Title
        WindowHandle = $target.WindowHandle
        WindowHandleHex = '0x{0:X}' -f $target.WindowHandle
        Bounds = [pscustomobject] @{
            Left = $rect.Left; Top = $rect.Top; Right = $rect.Right; Bottom = $rect.Bottom
            Width = $width; Height = $height
        }
    }
}
finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    [void] [T3WindowCapture.Native]::SetThreadDpiAwarenessContext($previousDpi)
}
