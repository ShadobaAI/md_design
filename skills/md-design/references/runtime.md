# Preview runtime

Commands use absolute paths and work from any directory. `--check` validates without starting a server. Files are limited to 200,000 UTF-16 code units / 800,000 bytes; never truncate silently.

`--background` returns JSON with `url`, `pid`, and `file`. Each instance listens on a free port at `127.0.0.1`; use the complete URL including its random path. Wait for readiness and verify loading after the launcher exits. Startup JSON alone does not prove continued availability.

## Windows sandbox

Run `--check` sandboxed. For `--background`, request the shell tool's `sandbox_permissions: "require_escalated"` on the first launch, with a justification limited to starting this local preview server. Windows MXC terminates detached children when the launching command exits; a foreground sandbox process may also be unreachable from the host browser. See [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox#mxc-compatibility).

If escalation is denied or unavailable, provide the exact command for the user's own terminal and state that preview could not be verified. Do not change sandbox settings or try alternate launchers to evade restrictions. Outside a sandbox, launch normally.

## Troubleshooting

- Inspect stderr and launch permissions before retrying. A shell socket-access error and a browser-permission denial are different failures.
- For browser access, use the browser tool's approval flow for the preview URL. Site permissions are under **Settings → Browser → Agent permissions**; organization restrictions require an administrator. Do not require permission for all websites. See [browser settings](https://learn.chatgpt.com/docs/reference/settings#browser).
- If `dist/parser.mjs` is missing in a source checkout, run `npm ci` and `npm run build`. Reinstall an incomplete installed package.
- An unchanged source preserves local input. Reload or a source edit resets it. Business commands, reference lookups and calculations are not connected to 1C.
- If the browser tool supports `markDeliverable()`, mark the final tab. Report unavailable visual checks explicitly.
