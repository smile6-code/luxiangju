# 通过已登录的 GitHub Desktop 凭据调用 api.github.com 完成发布准备。
#   pwsh -File tools/_gh-setup.ps1 -Step info          查看账号与权限范围
#   pwsh -File tools/_gh-setup.ps1 -Step repo          建仓库
#   pwsh -File tools/_gh-setup.ps1 -Step key           添加本机 SSH 公钥
#   pwsh -File tools/_gh-setup.ps1 -Step pages         开启 GitHub Pages
param(
  [Parameter(Mandatory = $true)][ValidateSet('info', 'repo', 'key', 'pages', 'listkeys')][string]$Step,
  [string]$Repo = 'luxiangju',
  [string]$Owner = 'smile6-code'
)
$ErrorActionPreference = 'Stop'

Add-Type -Namespace W32 -Name CredApi -MemberDefinition @"
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredReadW")]
public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
[DllImport("advapi32.dll")]
public static extern void CredFree(IntPtr cred);
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct CREDENTIAL {
  public uint Flags; public uint Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public uint CredentialBlobSize; public IntPtr CredentialBlob;
  public uint Persist; public uint AttributeCount; public IntPtr Attributes;
  public string TargetAlias; public string UserName;
}
"@

$ptr = [IntPtr]::Zero
$target = "GitHub - https://api.github.com/$Owner"
if (-not [W32.CredApi]::CredRead($target, 1, 0, [ref]$ptr)) {
  throw "读取凭据失败,请确认 GitHub Desktop 已登录 $Owner"
}
$cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][W32.CredApi+CREDENTIAL])
$len = [int]$cred.CredentialBlobSize
$bytes = New-Object byte[] $len
[Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $len)
[W32.CredApi]::CredFree($ptr)
$token = ([Text.Encoding]::UTF8.GetString($bytes)).Trim([char]0).Trim()

$H = @{
  Authorization          = "Bearer $token"
  'User-Agent'           = 'codex-setup'
  Accept                 = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}

function ShowError($err) {
  Write-Output ("  失败: " + $err.Exception.Message)
  if ($err.Exception.Response) {
    $sr = New-Object IO.StreamReader($err.Exception.Response.GetResponseStream())
    Write-Output ("  响应: " + $sr.ReadToEnd())
  }
}

switch ($Step) {
  'info' {
    $r = Invoke-WebRequest -Uri 'https://api.github.com/user' -Headers $H -TimeoutSec 30
    $me = $r.Content | ConvertFrom-Json
    Write-Output ("账号        : " + $me.login)
    Write-Output ("显示名      : " + $me.name)
    Write-Output ("令牌权限    : " + ($r.Headers['x-oauth-scopes'] -join ''))
    Write-Output ("剩余额度    : " + ($r.Headers['x-ratelimit-remaining'] -join ''))
  }

  'repo' {
    $body = @{
      name        = $Repo
      description = '鲁香居 LUXIANGJU — 山东菜(鲁菜)餐馆单页官网,纯静态零依赖'
      private     = $false
      has_issues  = $true
      has_wiki    = $false
      auto_init   = $false
    } | ConvertTo-Json
    try {
      $r = Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $H -Body $body -TimeoutSec 45
      Write-Output ("已创建仓库  : " + $r.full_name)
      Write-Output ("克隆地址    : " + $r.ssh_url)
    } catch {
      ShowError $_
      Write-Output ("  提示:若仓库已存在可忽略,继续下一步即可")
    }
  }

  'key' {
    $pub = (Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" -Raw).Trim()
    $body = @{ title = 'triumph-laptop-codex'; key = $pub } | ConvertTo-Json
    try {
      $r = Invoke-RestMethod -Uri 'https://api.github.com/user/keys' -Method Post -Headers $H -Body $body -TimeoutSec 45
      Write-Output ("已添加公钥  : id=" + $r.id + "  " + $r.title)
    } catch {
      ShowError $_
    }
  }

  'listkeys' {
    try {
      $r = Invoke-RestMethod -Uri 'https://api.github.com/user/keys' -Headers $H -TimeoutSec 30
      Write-Output ("已有公钥数  : " + @($r).Count)
      @($r) | ForEach-Object { Write-Output ("  - " + $_.title + "  (id " + $_.id + ")") }
    } catch { ShowError $_ }
  }

  'pages' {
    $body = @{ source = @{ branch = 'main'; path = '/' } } | ConvertTo-Json
    try {
      $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/pages" -Method Post -Headers $H -Body $body -TimeoutSec 45
      Write-Output ("Pages 已开启: " + $r.html_url)
    } catch {
      ShowError $_
    }
  }
}
