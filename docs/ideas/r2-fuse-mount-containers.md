**Added:** 2026-03-18
**Status:** Idea
**Category:** Infrastructure / Storage

## Summary

Mount R2 bucket as a filesystem inside sandbox containers using FUSE. Claude's agent reads/writes files at `/mnt/r2/` like a normal directory — no API round-trips through the Worker.

## Details

- Docs: https://developers.cloudflare.com/containers/examples/r2-fuse-mount/
- Uses tigrisfs FUSE adapter to mount R2 as a local filesystem
- Currently VaporFiles uses R2 via Worker API (payload size limits, extra hop)
- FUSE mount lets container access R2 directly — simpler, larger files, no Worker bottleneck
- Requires R2 API credentials passed as container env vars (secrets)
- Read-heavy performance is fine for code files; not suited for heavy random I/O

## Use Cases for VaporForge

1. **Persistent workspace** — container mounts user's R2 prefix on startup, files survive container recycling
2. **Large file support** — bypasses Worker payload size limits
3. **Simpler file ops** — agent uses standard fs.readFile/writeFile instead of custom VaporFiles API
4. **Shared state** — multiple sessions can read from same R2 prefix

## Risks

- FUSE mount adds startup latency (install adapter + mount)
- Not POSIX-compliant — edge cases with locks, renames, concurrent writes
- Need per-user R2 prefix isolation (security)
- R2 API credentials need secure injection into container env

## Next Steps

- Test FUSE mount in a sandbox container (install tigrisfs, mount, verify read/write)
- Measure startup latency impact
- Design per-user prefix isolation scheme
- Compare with current VaporFiles API approach for latency and reliability
