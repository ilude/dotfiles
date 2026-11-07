<#
.SYNOPSIS
Open an exact tool-returned v2 T3 thread link in the already-running Windows desktop.
.DESCRIPTION
Invokes the registered t3code handler, not keyboard input. Navigates and activates
T3 normally, without sending a message or adding prompt query parameters. Returns
only dispatch evidence; capture and inspect the window to verify the visible thread.
There is no prior-view query or automatic restoration in this helper.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string] $Link
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This helper requires Windows.' }
$value = $Link.Trim()
if ($value.StartsWith('<') -and $value.EndsWith('>')) { $value = $value.Substring(1, $value.Length - 2) }
if ($value -cnotmatch '^t3-thread://v2/([^/\s<>]+)/([^\s<>]+)$') {
    throw 'Pass an exact t3-thread://v2/<environment>/<thread> link returned by T3 tools.'
}
$environmentId = $Matches[1]
$threadId = $Matches[2]
# Tool links hold IDs as written, including their own percent escapes. Escape once for the OS URL.
$uri = 't3code://threads/{0}/{1}' -f [Uri]::EscapeDataString($environmentId), [Uri]::EscapeDataString($threadId)
$command = (Get-Item 'Registry::HKEY_CLASSES_ROOT\t3code\shell\open\command').GetValue('')
if ($command -notmatch '^"([^"]+)"\s+"%1"$') { throw 'Unrecognized t3code protocol handler.' }
$executable = $Matches[1]
if ([IO.Path]::GetFileName($executable) -notin @('T3 Code.exe', 'T3 Code (Nightly).exe')) {
    throw 'The t3code protocol handler is not a recognized T3 desktop executable.'
}
$windows = @(Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and $_.Path -eq $executable -and
    $_.MainWindowTitle -in @('T3 Code', 'T3 Code (Nightly)')
})
if ($windows.Count -ne 1) { throw 'Expected exactly one already-running desktop main process for the registered handler.' }
$dispatched = $false
if ($PSCmdlet.ShouldProcess($uri, 'Navigate the running T3 desktop via its registered protocol')) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $executable
    $start.Arguments = '"{0}"' -f $uri
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    # T3's server gives Pi this flag; inheriting it runs Electron as Node, not as the URL handler.
    [void] $start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
    $launcher = [Diagnostics.Process]::Start($start)
    $launcher.Dispose()
    $dispatched = $true
}
[pscustomobject] @{
    EnvironmentId = $environmentId
    ThreadId = $threadId
    Uri = $uri
    ExecutablePath = $executable
    ProcessId = $windows[0].Id
    WindowHandle = $windows[0].MainWindowHandle.ToInt64()
    Dispatched = $dispatched
}
