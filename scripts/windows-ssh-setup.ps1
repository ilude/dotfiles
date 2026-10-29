#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Opt-in Windows OpenSSH Server setup for trusted networks.
.DESCRIPTION
    Installs the Windows capability, starts sshd automatically, and scopes the
    standard local SSH firewall rule to Domain/Private networks. Optionally
    permits SSH on the Tailscale interface, including on Public networks.
    Does not configure keys, change sshd_config, or modify managed policy rules.
.EXAMPLE
    .\scripts\windows-ssh-setup.ps1
.EXAMPLE
    .\scripts\windows-ssh-setup.ps1 -AllowTailscale
#>
[CmdletBinding()]
param(
    [switch]$AllowTailscale
)

$ErrorActionPreference = 'Stop'

# Resolve the optional interface before making any changes.
$tailscaleInterface = $null
if ($AllowTailscale) {
    $adapters = @(Get-NetAdapter -IncludeHidden | Where-Object {
        $_.Name -eq 'Tailscale' -or $_.InterfaceDescription -like '*Tailscale*'
    })
    if ($adapters.Count -ne 1) {
        throw 'Expected one Tailscale adapter. Install/connect Tailscale before using -AllowTailscale.'
    }
    $tailscaleInterface = $adapters[0].Name
}

# Show existing SSH-specific effective rules before changing the local rule.
# Group Policy rules remain owned by their administrator.
$existingRules = @(Get-NetFirewallRule -PolicyStore ActiveStore | Where-Object {
    $_.Name -match 'ssh' -or $_.DisplayName -match 'OpenSSH'
})
if ($existingRules.Count -gt 0) {
    $existingRules | Select-Object Name,Enabled,Direction,Action,Profile,PolicyStoreSourceType | Format-Table -AutoSize
    $existingRules | Get-NetFirewallPortFilter | Select-Object InstanceID,Protocol,LocalPort | Format-Table -AutoSize
    $existingRules | Get-NetFirewallAddressFilter | Select-Object InstanceID,LocalAddress,RemoteAddress | Format-Table -AutoSize
    $existingRules | Get-NetFirewallInterfaceFilter | Select-Object InstanceID,InterfaceAlias | Format-Table -AutoSize
}

$capability = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
if ($capability.State -ne 'Installed') {
    $result = Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
    if ($result.RestartNeeded) {
        Write-Warning 'Windows requires a restart. Restart and rerun this command to finish SSH setup.'
        exit 3010
    }
}

$ruleName = 'OpenSSH-Server-In-TCP'
$rule = Get-NetFirewallRule -PolicyStore PersistentStore -Name $ruleName -ErrorAction SilentlyContinue
if ($rule) {
    Set-NetFirewallRule -PolicyStore PersistentStore -Name $ruleName `
        -Enabled True -Direction Inbound -Action Allow -Profile Domain,Private `
        -Protocol TCP -LocalPort 22 -RemoteAddress Any -InterfaceAlias Any | Out-Null
} else {
    New-NetFirewallRule -PolicyStore PersistentStore -Name $ruleName `
        -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound `
        -Action Allow -Profile Domain,Private -Protocol TCP -LocalPort 22 | Out-Null
}

# Omission preserves a previously requested Tailscale exception.
if ($AllowTailscale) {
    $tailscaleRuleName = 'Dotfiles-OpenSSH-Tailscale-In-TCP'
    $tailscaleRule = Get-NetFirewallRule -PolicyStore PersistentStore -Name $tailscaleRuleName -ErrorAction SilentlyContinue
    if ($tailscaleRule) {
        Set-NetFirewallRule -PolicyStore PersistentStore -Name $tailscaleRuleName `
            -Enabled True -Direction Inbound -Action Allow -Profile Any `
            -Protocol TCP -LocalPort 22 -RemoteAddress Any `
            -InterfaceAlias $tailscaleInterface | Out-Null
    } else {
        New-NetFirewallRule -PolicyStore PersistentStore -Name $tailscaleRuleName `
            -DisplayName 'Dotfiles OpenSSH Server (Tailscale)' -Enabled True `
            -Direction Inbound -Action Allow -Profile Any -Protocol TCP `
            -LocalPort 22 -InterfaceAlias $tailscaleInterface | Out-Null
    }
}

Set-Service -Name sshd -StartupType Automatic
Start-Service -Name sshd
Get-Service -Name sshd | Select-Object Name,Status,StartType
Write-Host 'SSH server enabled. Standard local firewall access is limited to Domain/Private networks.'
Write-Host 'Existing SSH configuration, authorized keys, other firewall rules, and managed policy are unchanged.'
Write-Host 'Other existing allow rules can still grant access. This command does not establish a machine-wide firewall policy.'
Write-Host 'Authorize the connecting public key and test SSH from the intended client; installation does not verify login.'
