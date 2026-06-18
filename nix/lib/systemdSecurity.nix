# nix/lib/systemdSecurity.nix — shared systemd sandboxing for the prod units.
# Plain import-free attrset so any module can
# `inherit (import ./lib/systemdSecurity.nix) commonSecurityConfig;`.
#
# DELIBERATE EXCEPTION — MemoryDenyWriteExecute is NOT included: Bun's JIT
# (JavaScriptCore) needs W^X OFF or the server segfaults at startup. Omitting it
# from the shared set ensures no unit accidentally turns it on.
{
  commonSecurityConfig = {
    NoNewPrivileges = true;
    ProtectSystem = "strict"; # read-only /usr, /boot, /etc
    ProtectHome = true;
    PrivateTmp = true;
    PrivateDevices = true;
    ProtectKernelTunables = true;
    ProtectKernelModules = true;
    ProtectKernelLogs = true;
    ProtectControlGroups = true;
    RestrictNamespaces = true;
    RestrictRealtime = true;
    RestrictSUIDSGID = true;
    LockPersonality = true;
    SystemCallArchitectures = "native";
    UMask = "0077";
    RestrictAddressFamilies = [
      "AF_UNIX" # Postgres + Garage loopback sockets
      "AF_INET" # Cloudflare/Pollinations/Resend outbound + the 127.0.0.1 listen socket
      "AF_INET6"
    ];
    # MemoryDenyWriteExecute intentionally ABSENT — Bun JIT requires W^X OFF.
  };
}
