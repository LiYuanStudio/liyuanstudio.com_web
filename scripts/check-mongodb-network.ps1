param(
  [string]$ClusterHost = 'cluster0.lck8ae0.mongodb.net'
)

$ErrorActionPreference = 'Continue'
Write-Host 'Proxy environment variables (values hidden):'
foreach ($name in @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY')) {
  $value = [Environment]::GetEnvironmentVariable($name)
  Write-Host "  ${name}: $(if ($value) { 'set' } else { 'not set' })"
}

Write-Host "`nMongoDB SRV DNS lookup:"
try {
  $records = Resolve-DnsName -Name "_mongodb._tcp.$ClusterHost" -Type SRV -DnsOnly -ErrorAction Stop
  $records | Where-Object { $_.Type -eq 'SRV' } | Select-Object NameTarget, Port | Format-Table -AutoSize
} catch {
  Write-Host '  SRV lookup failed.'
}

Write-Host 'Public IP through curl default proxy settings:'
& curl.exe --silent --show-error --max-time 10 https://api.ipify.org
Write-Host "`nPublic IP with proxy explicitly bypassed:"
& curl.exe --silent --show-error --max-time 10 --noproxy '*' https://api.ipify.org
Write-Host "`nThe HTTP exit IP may differ from the MongoDB driver's TCP route."
