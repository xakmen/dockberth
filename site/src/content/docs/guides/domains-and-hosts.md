---
title: Domains and the hosts file
description: How every project gets a myapp.test domain — the shared Traefik proxy, the managed hosts-file block, and the single UAC prompt.
sidebar:
  order: 3
---

Every Dockberth project is reachable at `<name>.test` — `myshop.test`,
`client-api.test` — instead of `localhost:8081`, `localhost:8082`, and a
sticky note telling you which is which.

## The shared proxy

A single global **Traefik** container owns ports **80** and **443** on your
machine. When a project starts, its app container joins a shared Docker
network with routing labels; Traefik picks them up automatically and routes
`Host(<name>.test)` requests to the right container. Because only the proxy
binds host ports, projects never collide — run as many as you like
side by side.

The proxy also self-heals: if it disappears or gets into a bad state,
Dockberth brings it back when you start a project.

:::note
The `.test` suffix is the default and is
[reserved for exactly this purpose](https://en.wikipedia.org/wiki/.test) —
it will never clash with a real domain. You can change the suffix in
**Settings**.
:::

## The hosts file, managed

Browsers need `myshop.test` to resolve to `127.0.0.1`, which on Windows
means the hosts file (`C:\Windows\System32\drivers\etc\hosts`) — editable
only as administrator. Dockberth handles this conservatively:

- All Dockberth entries live inside one clearly marked block:

  ```
  # BEGIN DOCKBERTH MANAGED BLOCK
  127.0.0.1 myshop.test
  127.0.0.1 client-api.test
  # END DOCKBERTH MANAGED BLOCK
  ```

- Everything **outside** the block is your territory and is preserved
  byte-for-byte.
- The main app never runs as admin. Writes go through a separate elevated
  helper — that's the **single UAC prompt** you see when domains change —
  and the helper only does backup → write → move; all content logic runs
  (and is sanity-checked) in the unprivileged app first.

If you remove a project, its entry is removed from the block the same way.

## HTTPS

Traefik listens on 443, and TLS for `*.test` with locally trusted
certificates is on the roadmap. Today, use `http://<name>.test`.
