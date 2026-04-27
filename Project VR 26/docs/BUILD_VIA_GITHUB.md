# Build MidWest-VR using a web browser only

This is the path to use when you can't open Terminal on your work Mac
and you don't have any other Mac to borrow. We use **GitHub Actions** —
a free service that runs Apple's macOS computers in the cloud and
hands you back the finished `.app` as a download. You never touch
another physical Mac.

Total time: ~15 minutes the first time (mostly typing/clicking),
~10 minutes per rebuild after.

What you need:

- A web browser on your work Mac (Safari / Chrome / Edge — any of them).
- Access to **github.com** from that browser. Test by visiting
  <https://github.com> right now. If it loads, you're good.
- A personal email address to register a free GitHub account.
- The SandSpd-EX SSD plugged in (only at the very end).

If github.com won't load, your IT department has it blocked. In that
case you genuinely do need a different Mac — there's no other path I
can build for you.

---

## Step 1 — Create a free GitHub account (5 minutes)

1. Open <https://github.com/signup> in your browser.
2. Enter a personal email address (not your work email — keep this
   separate from work).
3. Pick a password. Pick a username (anything; this won't be public
   in any meaningful way).
4. Verify the email — GitHub sends you a code.
5. When asked about a plan, choose **Free**.

You're done. No payment, no phone number.

---

## Step 2 — Create a new repository (2 minutes)

1. Click the green **New** button on your dashboard, or go to
   <https://github.com/new>.
2. **Repository name:** `midwest-vr` (or anything — it doesn't matter).
3. Set visibility to **Public**.
   - Why public? Public repos get **unlimited** GitHub Actions
     minutes for free. Private repos give you ~200 effective Mac
     minutes per month (about 13 builds), which is also fine, but
     public is simpler. There are no secrets in this project.
4. Leave "Initialize this repository" unchecked.
5. Click **Create repository**.

You land on an empty repo page that says "Quick setup".

---

## Step 3 — Upload the project files (5 minutes)

1. On the empty repo page, click the link that says
   **"uploading an existing file"** (it's in the "Quick setup" box),
   or click **Add file** → **Upload files** at the top of the repo.

2. A page opens that says "Drag files here to add them to your
   repository, or **choose your files**".

3. Open Finder. Press **Cmd+Shift+G**, paste this path, press Return:

       /Users/drew.norton/Documents/Project VR 26

   (Or, if you've already moved the folder to the SSD,
   `/Volumes/SandSpd-EX/MidWest-VR`.)

4. In Finder, press **Cmd+A** to select everything inside that folder.

5. **Drag the selection** from Finder onto the GitHub upload area in
   your browser. GitHub will start uploading every file (including
   subfolders like `src/`, `src-tauri/`, `docs/`, `.github/`).

   Wait until you see all files listed at the bottom of the upload
   page. This usually takes 1–3 minutes depending on your connection.

   ⚠️ **Important:** Make sure the `.github` folder uploaded. It's
   the one that tells GitHub how to build the app. If Finder hides
   dot-folders by default, press **Cmd+Shift+.** in Finder to show
   them, then re-select.

6. Scroll down on the GitHub page. In the "Commit changes" section,
   leave the message as the default ("Add files via upload"). Make
   sure "Commit directly to the main branch" is selected.

7. Click the green **Commit changes** button.

GitHub stores your project. The page reloads showing all your files.

---

## Step 4 — Watch the build (10 minutes)

The instant your files commit, GitHub Actions starts compiling. You
don't have to do anything to trigger it.

1. Click the **Actions** tab near the top of your repo page.

2. You'll see a workflow called **"Build MidWest-VR for macOS"** with
   a yellow spinner ("In progress") next to it.

3. Click on that workflow run to watch the live progress. You'll see
   steps like "Set up Rust toolchain", "Install JS dependencies",
   "Build Tauri release". The slowest step is the Rust compile, which
   takes 5–8 minutes on a cold cache.

4. You can leave this tab and come back. GitHub keeps building even
   if you close the browser.

When the run finishes, the spinner becomes a green check mark
("Success") or a red X (failed — see Troubleshooting below).

---

## Step 5 — Download the .app (1 minute)

1. With the green check mark showing, scroll down on the workflow
   run page. There's a section titled **Artifacts** at the bottom.

2. Click the file **MidWest-VR-macos** (or `MidWest-VR-macos.zip`).
   Your browser downloads a `.zip` file (about 12 MB) to your
   Downloads folder.

---

## Step 6 — Move the .app onto your SSD (2 minutes)

Everything from here uses Finder only. No Terminal.

1. Plug in the SandSpd-EX SSD if you haven't already.

2. Open Finder. Go to **Downloads**.

3. Find `MidWest-VR-macos.zip`. **Double-click it.** macOS unzips it
   into a folder containing `MidWest-VR.app`.

4. In another Finder window (Cmd+N), press **Cmd+Shift+G**, paste:

       /Volumes/SandSpd-EX/MidWest-VR

   Press Return.

5. Drag `MidWest-VR.app` from Downloads into the SandSpd-EX/MidWest-VR
   window. (Hold Option to copy instead of move if you want.)

6. You can delete the `.zip` and the unzipped folder in Downloads
   now if you like — they're duplicates of what's on the SSD.

---

## Step 7 — Launch the app (30 seconds)

1. With the SSD still plugged in, double-click `MidWest-VR.app` in
   `/Volumes/SandSpd-EX/MidWest-VR/`.

2. The first time, macOS may show: **"MidWest-VR.app cannot be opened
   because the developer cannot be verified."** This is the standard
   Gatekeeper prompt for ad-hoc-signed apps.

   - Click **Done** on that dialog (do NOT click "Move to Bin").
   - **Right-click** (or Control-click) `MidWest-VR.app`.
   - Choose **Open**.
   - In the new dialog, click **Open**.

   This is a one-time approval. Future launches are silent.

3. The app opens. Connect a Quest 2 via USB and follow the in-app
   **Connect** wizard.

You're done. The next time you want to launch the app, just
double-click `MidWest-VR.app` on the SSD. Steps 1–6 only happen once.

---

## Updating to a new build later

If we ever change the source code:

1. Go to your repo on github.com.
2. Click **Add file** → **Upload files**.
3. Drag the changed file(s) (or the whole folder again) onto the
   upload area.
4. Commit.
5. GitHub Actions auto-rebuilds. Wait 5–8 minutes (cached builds are
   faster).
6. Download the new artifact (Step 5 above).
7. Replace `MidWest-VR.app` on the SSD with the new one (drag it
   from Downloads onto the SSD; Finder asks if you want to replace —
   say yes).

Your `MidWest-VR.config.json` next to the app on the SSD is left
alone, so your settings persist across updates.

---

## Troubleshooting

### "GitHub won't load on my work Mac."

IT has blocked it. There's no workaround here without a different
device. Try the website on your phone (using cell data, not work Wi-Fi)
to confirm — if your phone reaches github.com but your work Mac
doesn't, it's confirmed network blocking.

### "The build run shows a red X."

Click the failed run. The first line in red usually explains what
broke. Common causes:

- A file failed to upload. Check that the `.github` folder is in
  your repo's file listing on github.com.
- An npm package became briefly unavailable. Click **Re-run all
  jobs** at the top of the run page; usually transient.
- The Tauri or Rust ecosystem published a breaking change. Open an
  issue with what you saw and we'll patch.

### "I can't find the .github folder in my upload."

macOS Finder hides folders that start with a dot by default. In
Finder, press **Cmd+Shift+.** (period). The `.github` folder
becomes visible. Drag it explicitly into the upload page.

### "GitHub says my repo is too big."

The free upload limit is 25 MB per file and ~1 GB per repo. The
project source is well under that, but `node_modules/` and the
`target/` folder must NOT be uploaded — they're gigabytes. The
project's `.gitignore` already excludes them. If you accidentally
uploaded them, delete the repo and start over.

### "The artifact zip won't download — browser blocks it."

Some org browsers block zip downloads from "untrusted" sources.
Workarounds:

- Try a different browser (Safari ↔ Chrome).
- On the run page, expand the artifact section — sometimes there's
  a direct file listing.
- Last resort: if your phone can reach github.com, log in there,
  download the zip onto your phone, then AirDrop to your work Mac
  (which doesn't go through the work network).

### "macOS still won't open the .app even after right-click → Open."

If your work Mac has hardened Gatekeeper via MDM, ad-hoc signed
apps may be blocked entirely. There's no easy workaround for this
besides:

- Asking IT to allow it for your account.
- Getting a real Apple Developer ID ($99/year) and signing
  properly. If you go that route, see `docs/PORTABLE_SSD.md` for
  what to change in the config.
