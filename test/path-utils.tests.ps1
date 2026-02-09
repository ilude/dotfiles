# Pester tests for path-utils.ps1
# Compatible with Pester 3.x and 5.x
# Run with: Invoke-Pester test/path-utils.tests.ps1

# Source the functions being tested
. "$PSScriptRoot/../powershell/lib/path-utils.ps1"

Describe "ConvertTo-GitBashPath" {
    It "converts C:\ drive to /c/" {
        ConvertTo-GitBashPath "C:\Users\test" | Should Be "/c/Users/test"
    }

    It "converts lowercase drive letters" {
        ConvertTo-GitBashPath "c:\temp" | Should Be "/c/temp"
    }

    It "converts backslashes to forward slashes" {
        ConvertTo-GitBashPath "C:\Program Files\Git" | Should Be "/c/Program Files/Git"
    }

    It "handles D: drive" {
        ConvertTo-GitBashPath "D:\Projects" | Should Be "/d/Projects"
    }

    It "passes through non-Windows paths unchanged" {
        ConvertTo-GitBashPath "/usr/bin" | Should Be "/usr/bin"
    }

    It "handles paths with spaces" {
        ConvertTo-GitBashPath "C:\Program Files\My App\bin" | Should Be "/c/Program Files/My App/bin"
    }
}

Describe "ConvertTo-WSLPath" {
    It "converts C:\ to /mnt/c/" {
        ConvertTo-WSLPath "C:\Users\test" | Should Be "/mnt/c/Users/test"
    }

    It "converts D: drive to /mnt/d/" {
        ConvertTo-WSLPath "D:\Projects" | Should Be "/mnt/d/Projects"
    }

    It "handles spaces in path" {
        ConvertTo-WSLPath "C:\Program Files\App" | Should Be "/mnt/c/Program Files/App"
    }

    It "converts lowercase drive letters" {
        ConvertTo-WSLPath "e:\data" | Should Be "/mnt/e/data"
    }

    It "passes through non-Windows paths unchanged" {
        ConvertTo-WSLPath "/home/user" | Should Be "/home/user"
    }
}

Describe "Get-ContentLF" {
    $testDir = Join-Path $env:TEMP "pester-path-utils"
    $testFile = Join-Path $testDir "test.txt"

    # Setup test directory
    if (-not (Test-Path $testDir)) {
        New-Item -ItemType Directory -Path $testDir -Force | Out-Null
    }

    It "converts CRLF to LF" {
        "line1`r`nline2" | Set-Content $testFile -NoNewline
        $result = Get-ContentLF $testFile
        $result | Should Not Match "`r"
        $result | Should Be "line1`nline2"
    }

    It "converts standalone CR to LF" {
        "line1`rline2" | Set-Content $testFile -NoNewline
        $result = Get-ContentLF $testFile
        $result | Should Be "line1`nline2"
    }

    It "preserves LF-only content" {
        [System.IO.File]::WriteAllText($testFile, "line1`nline2")
        $result = Get-ContentLF $testFile
        $result | Should Be "line1`nline2"
    }

    It "handles empty files" {
        [System.IO.File]::WriteAllText($testFile, "")
        $result = Get-ContentLF $testFile
        $result | Should BeNullOrEmpty
    }

    # Cleanup
    if (Test-Path $testDir) {
        Remove-Item $testDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Describe "Get-GitBash" {
    It "returns a path or null" {
        $result = Get-GitBash
        # On Windows with Git installed, should return a path
        # On systems without Git, returns null
        if ($result) {
            $result | Should Match "bash"
        }
    }

    It "does not return WSL bash from WindowsApps" {
        $result = Get-GitBash
        if ($result) {
            $result | Should Not Match "WindowsApps"
        }
    }

    It "does not return WSL bash" {
        $result = Get-GitBash
        if ($result) {
            $result | Should Not Match "wsl"
        }
    }
}

Describe "Get-GitBash WSL filtering" {
    It "should not return WSL bash from WindowsApps" {
        Mock Get-Command {
            @(
                [PSCustomObject]@{ Source = "C:\Program Files\Git\usr\bin\bash.exe" },
                [PSCustomObject]@{ Source = "C:\Windows\System32\bash.exe" },
                [PSCustomObject]@{ Source = "$env:LOCALAPPDATA\Microsoft\WindowsApps\bash.exe" }
            )
        }
        Mock Test-Path { return $false }
        $result = Get-GitBash
        $result | Should Not Match 'WindowsApps'
        $result | Should Not Match 'System32'
    }

    It "should return Git Bash when mixed with WSL paths" {
        Mock Get-Command {
            @(
                [PSCustomObject]@{ Source = "C:\Program Files\Git\usr\bin\bash.exe" },
                [PSCustomObject]@{ Source = "$env:LOCALAPPDATA\Microsoft\WindowsApps\bash.exe" }
            )
        }
        Mock Test-Path { return $false }
        $result = Get-GitBash
        $result | Should Be "C:\Program Files\Git\usr\bin\bash.exe"
    }

    It "should return null when only WSL bash is available" {
        Mock Get-Command {
            @(
                [PSCustomObject]@{ Source = "$env:LOCALAPPDATA\Microsoft\WindowsApps\bash.exe" }
            )
        }
        Mock Test-Path { return $false }
        $result = Get-GitBash
        $result | Should BeNullOrEmpty
    }
}
