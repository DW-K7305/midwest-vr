# Connecting Meta Quest 2 headsets to MidWest-VR

This is a one-time setup per headset. Plan on **about 90 seconds per headset**
the first time. After this, plugging the headset into your Mac just works.

There's nothing magic in this guide — it's the same thing the in-app **Connect**
page walks through. The advantage of this document is that it's printable and
sharable with classroom staff who don't need to see the rest of MidWest-VR.

---

## What you need

- The Meta Quest 2 headset, charged.
- The phone you used to set up the headset (this is the phone running the
  **Meta Quest** app — formerly **Oculus**).
- A USB-C data cable (the one in the headset's box works fine; cheap charging
  cables do not).
- A Mac with MidWest-VR installed.

You'll need a **free Meta Developer org** before you can enable Developer Mode.
If you've never set one up:

1. On the phone, open the Meta Quest app.
2. Go to **Menu → Devices → Headset settings → Developer mode**.
3. The first time, the app shows a button that says **Create developer
   organization** (or links you out to *developers.meta.com*). Tap it, log in
   with the same Meta account that owns the headset, accept the terms, give
   the org any name (we use "Classroom" for ours), and you're back.

This needs to be done **once per Meta account**, not once per headset.

---

## Step 1 — Enable Developer Mode

On the phone running the Meta Quest app:

1. Tap **Menu** (bottom right).
2. Tap **Devices**.
3. Tap the headset you want to connect.
4. Tap **Headset settings**.
5. Tap **Developer mode**.
6. Toggle the switch to **On**.

The headset doesn't need to be on to do this — the toggle gets pushed when the
headset next powers up.

---

## Step 2 — Plug into the Mac

1. Plug the USB-C cable into the headset.
2. Plug the other end into a USB port on the Mac (any port — the M4 Air has
   USB-C).
3. Don't put the headset on yet.

If the Mac shows a notification about a "new disk", that's the headset
appearing as a flash drive — you can ignore that. MidWest-VR uses adb, not file
sharing.

---

## Step 3 — Authorize the Mac (on the headset)

1. Put on the headset.
2. The headset shows a small dialog: **"Allow USB debugging?"** with the
   Mac's RSA fingerprint underneath.
3. Tick the box that says **Always allow from this computer**.
4. Tap **OK**.

This is the moment the headset becomes manageable. Do **not** skip the "Always
allow" checkbox, otherwise you'll see this prompt every single time you
re-plug, which gets old fast.

---

## Step 4 — Confirm in MidWest-VR

1. Take the headset off and look at the Mac.
2. MidWest-VR's **Dashboard** shows a card for the headset, green badge "Online",
   battery percentage, storage info.
3. If the badge says **"Tap Allow on headset"**, the dialog from Step 3 is
   still waiting. Put the headset back on and tap OK.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing shows up at all | Charge-only cable | Use the cable that came with the headset, or any "USB-C 3.x" data cable |
| Card shows "Tap Allow on headset" but no dialog appears | Authorize-this-computer was tapped "no" once before | On the headset, **Settings → System → Developer → Reset trusted computers**, then re-plug |
| Card flickers between Online and Offline | Bad cable, or headset USB port has lint in it | Try a different cable / blow out the port |
| Developer Mode toggle isn't there in the phone app | The Meta account isn't a developer org member yet | See "Free Meta Developer org" up top |
| The Mac itself doesn't see anything when I run `ls /dev/cu.*` | macOS Tahoe USB permissions | **System Settings → Privacy & Security → USB Accessories** — make sure MidWest-VR is allowed |

---

## Removing a headset

Unplug it. That's it. MidWest-VR notices the disconnect within a few seconds and
removes the card. The "Always allow" trust persists, so re-plugging the same
headset later goes straight to Online without re-prompting.

If you want to *revoke* the Mac's authorization on the headset (e.g., before
giving the headset to someone else):

- Headset: **Settings → System → Developer → Reset trusted computers**.
- Then on the new Mac, repeat the steps above.
