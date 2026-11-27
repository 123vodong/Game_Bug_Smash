---
trigger: always_on
description: Beep 10 times in a row when all requested tasks (including background agents) are finished.
---

# Notify When Done

When **every** requested task is finished (including all background agents/workflows), and just before the final report, run this command once (it beeps 10 times in a row):

```powershell
powershell -c "1..10 | ForEach-Object { [System.Console]::Beep(1000, 300); Start-Sleep -Milliseconds 100 }"
```

- One run per completed batch of work, not after each sub-task or agent.
- Do not beep when blocked, waiting for the user's decision, or when work is only partly done.
- A failed beep must not block the final report; just mention it.
