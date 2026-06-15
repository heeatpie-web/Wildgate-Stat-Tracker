ViGEmBus Virtual Gamepad Dependencies
======================================

This directory should contain two files:

1. Nefarius.ViGEm.Client.dll  (~290 KB)
   - Managed .NET wrapper for the ViGEmBus driver (embeds native client via Costura).
   - Download from NuGet: https://www.nuget.org/packages/Nefarius.ViGEm.Client
   - Extract the .nupkg (it's a ZIP) and grab lib/netstandard2.0/Nefarius.ViGEm.Client.dll

2. ViGEmBus_1.22.0_x64_x86_arm64.exe  (~6 MB)
   - The kernel-mode driver installer for virtual gamepad emulation.
   - Download from: https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0
   - Users only need to install this once; the app detects and prompts automatically.

Both are BSD-3 licensed by Nefarius Software Solutions e.U.
The ViGEmBus project is retired but the v1.22.0 driver remains functional and signed.
