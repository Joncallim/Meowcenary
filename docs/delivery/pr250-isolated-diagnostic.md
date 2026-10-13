# Disposable #250 phase diagnostic

This branch is evidence only, not a product candidate or acceptance run. Main, #250 and all other held branches are unchanged. It preserves the application, original fixture, build dependencies and Playwright configuration at `54a761427de5a9a580ee516e7eb11c6d8d2de0dc`.

The extra fixture adds Node monotonic timing around original physical commands and observations. It retains every event, assertion, two sequential owner frames, original 30-second budget, zero retries, and performance telemetry opt-in. No CPU throttling is applied. The dedicated workflow repeats only the original desktop1920 case three times under the current hosted Linux font/browser environment and uploads receipts even on failure. This deliberately narrow diagnosis is not the full six-profile repository acceptance suite and cannot certify the held candidate.

Goal: identify where the hosted deadline is spent without rerunning the unchanged full suite. Success alone does not explain the prior timeout or establish an improvement. No merge/deployment is authorised for this disposable diagnostic branch.
