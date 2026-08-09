# Pester tests for completion-cache.ps1
# Compatible with Pester 3.x and 5.x
# Run with: Invoke-Pester test/completion-cache.tests.ps1

$completionCacheHelper = Join-Path $PSScriptRoot '..\powershell\lib\completion-cache.ps1'

Describe "Completion cache helpers" {
    It "is safe to dot-source without creating the cache directory" {
        $originalLocalAppData = $env:LOCALAPPDATA
        $localAppData = Join-Path ([System.IO.Path]::GetTempPath()) ("completion-cache-source-" + [guid]::NewGuid())
        $cacheDirectory = Join-Path $localAppData 'PowerShell\CompletionCache'

        try {
            $env:LOCALAPPDATA = $localAppData
            . $completionCacheHelper

            Test-Path $cacheDirectory | Should Be $false
        } finally {
            $env:LOCALAPPDATA = $originalLocalAppData
            Remove-Item $localAppData -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "resolves the cache below LOCALAPPDATA" {
        $originalLocalAppData = $env:LOCALAPPDATA
        $localAppData = Join-Path ([System.IO.Path]::GetTempPath()) ("completion-cache-path-" + [guid]::NewGuid())

        try {
            $env:LOCALAPPDATA = $localAppData
            . $completionCacheHelper

            Get-CompletionCacheDirectory | Should Be (Join-Path $localAppData 'PowerShell\CompletionCache')
        } finally {
            $env:LOCALAPPDATA = $originalLocalAppData
        }
    }

    It "creates the requested cache directory without invoking unavailable tools" {
        $cacheDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("completion-cache-update-" + [guid]::NewGuid())
        . $completionCacheHelper
        Mock Get-Command { return $null }

        try {
            Update-CompletionCache -CacheDirectory $cacheDirectory

            Test-Path $cacheDirectory -PathType Container | Should Be $true
        } finally {
            Remove-Item $cacheDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
