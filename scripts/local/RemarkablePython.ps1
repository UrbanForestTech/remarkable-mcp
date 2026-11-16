# Dot-sourced by the launchers. Picks the Python that runs the server, in this order:
#   1. $env:REMARKABLE_MCP_PYTHON, if set;
#   2. %USERPROFILE%\.venvs\remarkable-mcp\Scripts\python.exe, if it exists;
#   3. <REPO>\.venv\Scripts\python.exe (what `uv sync` creates).
# Option 2 exists because Windows Smart App Control blocks the unsigned python.exe that uv writes
# into a virtual environment, and because OneDrive sync can delete files inside a .venv it syncs.
# A virtual environment made with python.org's signed installer and `python -m venv`, kept outside
# OneDrive, avoids both. See README.md in this folder.
function Get-RemarkablePython {
    param([Parameter(Mandatory)][string]$RepoRoot)
    if ($env:REMARKABLE_MCP_PYTHON) { return $env:REMARKABLE_MCP_PYTHON }
    $outside = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.venvs\remarkable-mcp\Scripts\python.exe'
    if (Test-Path -LiteralPath $outside) { return $outside }
    return (Join-Path $RepoRoot '.venv\Scripts\python.exe')
}
