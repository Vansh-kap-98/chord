# Chord - input synthesis sidecar.
# Reads one JSON command per line from stdin, executes it via Win32 SendInput,
# writes one JSON result per line to stdout. Stays resident so the Add-Type
# compile cost is paid exactly once, at startup.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Synth {
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION u; }

    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_EXTENDEDKEY = 0x0001, KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004;

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray)] INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] static extern bool CloseWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr PostMessage(IntPtr hWnd, uint msg, IntPtr wp, IntPtr lp);
    [DllImport("user32.dll")] static extern bool LockWorkStation();

    static int Size { get { return Marshal.SizeOf(typeof(INPUT)); } }

    static INPUT Key(ushort vk, bool up, bool ext) {
        INPUT i = new INPUT();
        i.type = INPUT_KEYBOARD;
        i.u.ki.wVk = vk;
        i.u.ki.dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (ext ? KEYEVENTF_EXTENDEDKEY : 0);
        return i;
    }

    // seq is a flat array of triples: vk, up(0/1), ext(0/1)
    public static uint SendKeys(int[] seq) {
        int n = seq.Length / 3;
        INPUT[] inputs = new INPUT[n];
        for (int k = 0; k < n; k++)
            inputs[k] = Key((ushort)seq[k*3], seq[k*3+1] != 0, seq[k*3+2] != 0);
        return SendInput((uint)n, inputs, Size);
    }

    public static uint SendText(string text) {
        // Surrogate pairs are emitted as two units, which is what SendInput expects.
        INPUT[] inputs = new INPUT[text.Length * 2];
        for (int k = 0; k < text.Length; k++) {
            INPUT down = new INPUT();
            down.type = INPUT_KEYBOARD;
            down.u.ki.wScan = (ushort)text[k];
            down.u.ki.dwFlags = KEYEVENTF_UNICODE;
            INPUT up = down;
            up.u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            inputs[k*2] = down; inputs[k*2+1] = up;
        }
        if (inputs.Length == 0) return 0;
        return SendInput((uint)inputs.Length, inputs, Size);
    }

    public static uint SendMouse(uint flags, uint data, int dx, int dy) {
        INPUT[] inputs = new INPUT[1];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].u.mi.dwFlags = flags;
        inputs[0].u.mi.mouseData = data;
        inputs[0].u.mi.dx = dx;
        inputs[0].u.mi.dy = dy;
        return SendInput(1, inputs, Size);
    }

    public static void Window(string cmd) {
        IntPtr h = GetForegroundWindow();
        if (h == IntPtr.Zero) return;
        if (cmd == "minimize") ShowWindow(h, 6);
        else if (cmd == "maximize") ShowWindow(h, 3);
        else if (cmd == "restore") ShowWindow(h, 9);
        else if (cmd == "close") PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); // WM_CLOSE
    }

    public static void Lock() { LockWorkStation(); }
}
'@

function Write-Result($id, $ok, $err) {
    $o = [ordered]@{ id = $id; ok = $ok }
    if ($err) { $o.error = $err }
    [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}

# Signal readiness only after Add-Type has compiled.
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim().Length -eq 0) { continue }
    $id = $null
    try {
        $cmd = $line | ConvertFrom-Json
        $id = $cmd.id
        switch ($cmd.op) {
            'ping'  { Write-Result $id $true $null }
            'keys'  { [void][Synth]::SendKeys([int[]]$cmd.seq); Write-Result $id $true $null }
            'text'  { [void][Synth]::SendText([string]$cmd.text); Write-Result $id $true $null }
            'mouse' { [void][Synth]::SendMouse([uint32]$cmd.flags, [uint32]$cmd.data, [int]$cmd.dx, [int]$cmd.dy); Write-Result $id $true $null }
            'win'   { [Synth]::Window([string]$cmd.cmd); Write-Result $id $true $null }
            'lock'  { [Synth]::Lock(); Write-Result $id $true $null }
            'quit'  { Write-Result $id $true $null; break }
            default { Write-Result $id $false "unknown op: $($cmd.op)" }
        }
    } catch {
        Write-Result $id $false $_.Exception.Message
    }
}
