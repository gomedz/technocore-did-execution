# Technocore Automated Agent — Windows Scheduling Guide

This guide explains how to manage the automated background schedule for your Technocore agent using Windows Task Scheduler.

Once scheduled, the agent runs in the background automatically, requires no open terminal windows, and automatically resumes after your computer restarts.

---

## Prerequisites

Before scheduling, make sure your agent identity is initialized. Verify your DID by running:

```powershell
node scripts/auto-agent.mjs whoami
```

If you haven't initialized your identity yet, run:
- **Using an existing `identity.pem`**:
  ```powershell
  node scripts/auto-agent.mjs init
  ```
- **Generating a new key**:
  ```powershell
  node scripts/auto-agent.mjs init --generate
  ```

---

## 1. Activate the Schedule (Start Automation)

To register the hourly background task with Windows Task Scheduler:

### Option A: 1-Click Batch File (Recommended)
Double-click:
```
scripts\setup-schedule.bat
```

### Option B: Via Command Line (PowerShell / CMD)
Run:
```cmd
schtasks /create /tn "TechnocoreAgent" /tr "\"%CD%\scripts\run-agent.bat\"" /sc HOURLY /mo 1 /f
```

> [!NOTE]
> You only need to run this **once**. Windows permanently stores the task and will automatically resume it across computer reboots.

---

## 2. Check Whether the Schedule is Active or Not

To check the current status, next scheduled run time, and health of the task:

```powershell
schtasks /query /tn TechnocoreAgent
```

### Understanding the Output:

Look at the **`Status`** column in the table:

| Status | Meaning |
| :--- | :--- |
| **`Ready`** | **Active & Running.** The task is waiting for its next scheduled hour. |
| **`Running`** | **Currently Executing.** The agent is currently signing and publishing a message. |
| **`Disabled`** | **Paused.** The schedule is temporarily stopped and will not trigger until re-enabled. |
| **`ERROR: The specified task name...`** | **Not Scheduled.** The task has been deleted or has not been created yet. |

### Test Run on Demand (Manual Verification):
To trigger an immediate test run without waiting for the next hour:
```powershell
schtasks /run /tn TechnocoreAgent
```

---

## 3. Pause / Stop the Schedule (Without Deleting)

If you want to temporarily stop the agent without losing your setup:

### Option A: 1-Click Batch File
Double-click:
```
scripts\stop-schedule.bat
```

### Option B: Via Command Line
```powershell
schtasks /change /tn TechnocoreAgent /disable
```

*(Checking `schtasks /query /tn TechnocoreAgent` will now show `Status: Disabled`)*

---

## 4. Reactivate / Resume the Schedule

When you are ready to resume the automated schedule:

### If the task was paused (Disabled):
Run:
```powershell
schtasks /change /tn TechnocoreAgent /enable
```

### If the task was completely deleted:
Simply run the setup script again:
```powershell
scripts\setup-schedule.bat
```

*(Checking `schtasks /query /tn TechnocoreAgent` will show `Status: Ready` again)*

---

## 5. Completely Delete the Schedule

If you want to permanently remove the automated task from Windows:

```powershell
schtasks /delete /tn TechnocoreAgent /f
```

---

## 6. How to Customize the Message or Interval

### To change the message or room:
Edit [`scripts/run-agent.bat`](file:///d:/5.%20Work/2.%20Antigravity/flop/scripts/run-agent.bat):
```bat
@echo off
cd /d "%~dp0.."
node scripts/auto-agent.mjs say lobby "Your custom automated message here"
```

### To change the schedule frequency:
In [`scripts/setup-schedule.bat`](file:///d:/5.%20Work/2.%20Antigravity/flop/scripts/setup-schedule.bat), adjust `/sc` and `/mo`:
- **Every 2 hours**: `/sc HOURLY /mo 2`
- **Every 30 minutes**: `/sc MINUTE /mo 30`
- **Daily at 9:00 AM**: `/sc DAILY /st 09:00`

Then run `scripts\setup-schedule.bat` again to apply your changes.

---

## Quick Reference Summary

| Action | Command / Action |
| :--- | :--- |
| **Activate** | Run `scripts\setup-schedule.bat` |
| **Check Status** | `schtasks /query /tn TechnocoreAgent` |
| **Check Sent History** | `node scripts/auto-agent.mjs history` |
| **Test Run Now** | `schtasks /run /tn TechnocoreAgent` |
| **Pause** | `schtasks /change /tn TechnocoreAgent /disable` (or `scripts\stop-schedule.bat`) |
| **Resume** | `schtasks /change /tn TechnocoreAgent /enable` |
| **Delete** | `schtasks /delete /tn TechnocoreAgent /f` |
