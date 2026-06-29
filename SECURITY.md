# Security Policy

slopscore is a **read-only static analyzer**. It scans files and prints findings; it
does not execute the code it scans, **spawns no subprocesses**, makes no network
calls, and never writes to your source (only `slopscore init` writes — and it refuses
to overwrite existing files). It has **zero runtime dependencies**, so its
supply-chain surface is just Node's standard library.

## Reporting a vulnerability

If you find a security issue in slopscore itself — for example, a crafted file that
could cause the scanner to execute code, exfiltrate data, or hang the process —
please report it privately:

- Use **GitHub's [private vulnerability reporting](https://github.com/Vinay-O/slopscore/security/advisories/new)** (Security → Report a vulnerability), or
- Email the maintainer (see the GitHub profile) with `slopscore security` in the subject.

Please include a minimal reproduction and the slopscore version (`slopscore --version`).
You'll get an acknowledgment within a few days. Please don't open a public issue
for a security report.

## Scope

In scope:
- Code execution, path traversal, or resource exhaustion triggered by scanning a
  malicious file or repository.
- A detector that leaks the secrets it finds anywhere other than the local report.

Out of scope:
- False positives / false negatives in detection — those are normal
  [issues](https://github.com/Vinay-O/slopscore/issues), not vulnerabilities.
- Vulnerabilities in *your* code that slopscore reports — that's slopscore working.

## Supported versions

slopscore ships from `main`. Fixes land on the latest release; there are no
long-term-support branches.
