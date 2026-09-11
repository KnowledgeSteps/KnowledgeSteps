param(
    [ValidatePattern('^[A-Za-z0-9._-]{3,64}$')]
    [string]$Username = 'admin'
)

$ErrorActionPreference = 'Stop'
$backendDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$configPath = Join-Path $backendDir 'admin-login.properties'
$credentialsPath = Join-Path $backendDir 'admin-credentials.txt'
if ((Test-Path -LiteralPath $configPath) -or (Test-Path -LiteralPath $credentialsPath)) {
    throw 'Existing admin configuration preserved. Remove or back up your local admin files explicitly before generating a new password.'
}

$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$salt = New-Object byte[] 16
$passwordBytes = New-Object byte[] 24
try {
    $random.GetBytes($salt)
    $random.GetBytes($passwordBytes)
} finally {
    $random.Dispose()
}
$password = [Convert]::ToBase64String($passwordBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
    $password, $salt, 600000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
try {
    $hash = [Convert]::ToBase64String($derive.GetBytes(32))
} finally {
    $derive.Dispose()
}
$encoded = 'pbkdf2-sha256$600000$' + [Convert]::ToBase64String($salt) + '$' + $hash
$utf8 = [System.Text.UTF8Encoding]::new($false)
$config = "auth.admin.username=$Username`nauth.admin.password-hash=$encoded`n"
$credentials = "Username: $Username`nPassword: $password`n`nLocal login only. Do not commit or share this file. You may delete it after saving the password securely.`n"

# CreateNew prevents concurrent runs from overwriting existing credentials.
foreach ($entry in @(@{ Path = $configPath; Content = $config }, @{ Path = $credentialsPath; Content = $credentials })) {
    $stream = [System.IO.File]::Open($entry.Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
    try {
        $bytes = $utf8.GetBytes($entry.Content)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Dispose()
    }
}
$password = $null
$credentials = $null
Write-Output "Created local admin configuration: $configPath"
Write-Output "Read your generated login credentials locally: $credentialsPath"
