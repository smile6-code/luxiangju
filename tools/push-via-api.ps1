# 在 github.com:443 被墙、但 api.github.com 可用的网络下,用 Git Data API 完成推送。
# 复用 GitHub Desktop 已登录的凭据,无需另外配置 SSH 或代理。
#
#   pwsh -File tools/push-via-api.ps1
#   pwsh -File tools/push-via-api.ps1 -Message "更新了菜单价格"
#
# 会自动 git add -A 并做一次本地提交,再把整棵目录树推到 GitHub。
# 新增文件、删除文件都能正确处理。
param(
  [string]$Owner = 'smile6-code',
  [string]$Repo = 'luxiangju',
  [string]$Branch = 'main',
  [string]$Message = ''
)
$ErrorActionPreference = 'Stop'
$Api = "https://api.github.com/repos/$Owner/$Repo"

# ---- 0. 先把改动归拢到本地提交 ----
if (-not (Test-Path '.git')) { throw "请在仓库根目录运行(当前:$((Get-Location).Path))" }
git add -A
git diff --cached --quiet
$staged = ($LASTEXITCODE -ne 0)
if ($staged) {
  if (-not $Message) {
    $Message = 'update: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' 更新站点内容'
  }
  git commit -q -m $Message
  Write-Output ("本地提交  : " + (git log -1 --pretty='%h %s'))
} else {
  Write-Output "本地无改动,直接按当前内容重新推送一次"
  if (-not $Message) { $Message = (git log -1 --pretty=%B).Trim() }
}

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
if (-not [W32.CredApi]::CredRead("GitHub - https://api.github.com/$Owner", 1, 0, [ref]$ptr)) {
  throw "读取 GitHub 凭据失败"
}
$cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][W32.CredApi+CREDENTIAL])
$n = [int]$cred.CredentialBlobSize
$buf = New-Object byte[] $n
[Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $buf, 0, $n)
[W32.CredApi]::CredFree($ptr)
$token = ([Text.Encoding]::UTF8.GetString($buf)).Trim([char]0).Trim()

$H = @{
  Authorization          = "Bearer $token"
  'User-Agent'           = 'codex-push'
  Accept                 = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}
function Api-Json($method, $url, $obj) {
  $p = @{ Uri = $url; Method = $method; Headers = $H; TimeoutSec = 120 }
  if ($null -ne $obj) { $p.Body = ($obj | ConvertTo-Json -Depth 6 -Compress); $p.ContentType = 'application/json' }
  return Invoke-RestMethod @p
}

# ---- 1. 收集要推送的文件(走 git 索引,自动遵守 .gitignore) ----
$files = git ls-files
if (-not $files) { throw "没有可推送的文件,确认在仓库根目录运行" }
Write-Output ("文件数: " + @($files).Count)

function Get-Base {
  try {
    $ref = Api-Json 'GET' "$Api/git/ref/heads/$Branch" $null
    $c = Api-Json 'GET' "$Api/git/commits/$($ref.object.sha)" $null
    return @{ parent = $ref.object.sha; tree = $c.tree.sha }
  } catch {
    return $null
  }
}

# ---- 2. 空仓库要先落一个初始提交,Git Data API 才可用 ----
$base = Get-Base
if (-not $base) {
  Write-Output "仓库为空,创建初始提交…"
  Api-Json 'PUT' "$Api/contents/.nojekyll" @{
    message = 'chore: 初始化仓库'
    content = [Convert]::ToBase64String([byte[]]@(10))
  } | Out-Null
  Start-Sleep -Seconds 2
  $base = Get-Base
  if (-not $base) { throw "初始提交创建后仍读不到分支,请稍后重试" }
}
Write-Output ("基于 " + $base.parent.Substring(0, 7))

# ---- 3. 逐个小文件上传为 blob ----
$tree = @()
$i = 0
foreach ($f in $files) {
  $i++
  $bytes = [IO.File]::ReadAllBytes((Join-Path (Get-Location) $f))
  $sha = (Api-Json 'POST' "$Api/git/blobs" @{
      content  = [Convert]::ToBase64String($bytes)
      encoding = 'base64'
    }).sha
  $tree += @{ path = $f; mode = '100644'; type = 'blob'; sha = $sha }
  Write-Output ("  [$i/$(@($files).Count)] $f  $([math]::Round($bytes.Length/1KB,1))KB")
}

# ---- 4. 建 tree / commit / 更新 ref ----
# 不用 base_tree:整棵树以当前文件列表为准,这样删除文件也能同步到 GitHub
$newTree = (Api-Json 'POST' "$Api/git/trees" @{ tree = $tree }).sha

if (-not $Message) { $Message = '更新站点' }

$commitBody = @{
  message = $Message
  tree    = $newTree
  author  = @{ name = 'smile6-code'; email = "$Owner@users.noreply.github.com" }
  parents = @($base.parent)
}
$newCommit = (Api-Json 'POST' "$Api/git/commits" $commitBody).sha
Api-Json 'PATCH' "$Api/git/refs/heads/$Branch" @{ sha = $newCommit; force = $false } | Out-Null

Write-Output ""
Write-Output ("推送完成  commit " + $newCommit.Substring(0, 7))
Write-Output ("仓库地址  https://github.com/$Owner/$Repo")
