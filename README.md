# Mind and Body

My life program, and the daily tool that runs it.

It tells me what to do today and this week, what to avoid, tracks whether I did it, and shows my progress in body, architecture skills, creativity and mind.

- Plain HTML, CSS and JavaScript. No build step, no framework, nothing to install.
- No server, no account, no tracking, no AI. Nothing leaves the device.
- Works offline after the first load, and can be installed on a phone like an app.
- The program itself lives in the `data/` folder as JSON files that I can edit.


## 1. Run it on my computer

The app must be opened through a small local web server (opening `index.html` directly with a double click does not work, browsers block it).

**On Windows, with nothing to install:**

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open `http://localhost:8080/` in the browser. Stop the server with Ctrl+C.

**If Python is installed**, this works too, from the project folder:

```
python -m http.server 8080
```

On my own computer the offline cache is switched off, so I always see my latest edits. To test the offline mode locally, open `http://localhost:8080/?sw=1` once. `?sw=0` switches it off again.


## 2. Run the tests

Start the local server, then open `http://localhost:8080/tests/`.

The page runs every test in the browser and shows a list. The tests cover the logic that matters: calories and macros, adherence, unlock rules, never miss twice, dates and weeks, the calendar file, the backup, and the list of offline files.

The same test files are written to also run in a terminal with Node.js (`node tests/run.js`). That way was never tried, because Node is not installed on this computer. The browser page is the one that is checked.


## 3. Put it on GitHub Pages

GitHub Pages is free for public repositories.

**Before publishing, know this:** a public repository can be read by anyone, and that includes my whole program in `data/`. For that reason the profile in `data/program.json` holds rough values on purpose (a rounded birth date, height and weight). I type my real ones in the app, under Settings, Profile. What I type in the app stays on my phone and is never published. Until I do, the targets card shows a reminder.

### Without Git (only the GitHub website)

1. Sign in on github.com and create a new repository. Name it `mind-and-body`. Choose Public.
2. On the repository page choose **Add file**, then **Upload files**.
3. Drag everything that is inside the project folder into the page: all the files and all the folders (`css`, `data`, `fonts`, `icons`, `js`, `tests`, `tools`).
   If GitHub says there are too many files, upload in two rounds.
4. Press **Commit changes**.
5. Open **Settings**, then **Pages**. Under "Build and deployment" choose **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
6. Wait one or two minutes. The app is at `https://USERNAME.github.io/mind-and-body/`.

### With Git or GitHub Desktop

1. Install Git (or GitHub Desktop, which is easier).
2. In the project folder:
   ```
   git init
   git add .
   git commit -m "Mind and Body"
   git branch -M main
   git remote add origin https://github.com/USERNAME/mind-and-body.git
   git push -u origin main
   ```
3. Switch on GitHub Pages as in step 5 above.

### Publishing a change later

Change the files, upload them again (or `git add .`, `git commit`, `git push`). The next time I open the app with a connection it downloads the new files by itself and shows "A new version is ready". I press Reload.

All paths in the app are relative, so it works in a sub folder like `/mind-and-body/`.


## 4. Install it on the phone

Open the GitHub Pages address on the phone, once, with a connection.

- **Android (Chrome):** menu with the three dots, then **Add to Home screen** or **Install app**.
- **iPhone (Safari only):** the Share button, then **Add to Home Screen**.

Open the app from its icon. From then on it works without a connection.

On an iPhone, the app on the home screen has its own storage, separate from Safari. I always use the icon, so my data stays in one place.


## 5. Edit the program

The program is in `data/`. Every file starts with a `_help` block that explains its fields.

| File | What is inside |
|---|---|
| `program.json` | Start date, phases, unlock stages and their dates, default settings |
| `schedule.json` | The template week: every block, its days, time, minimum version and unlock stage |
| `habits.json` | The do list and the don't list |
| `training.json` | Strength A and B, rep ranges, variations |
| `nutrition.json` | Formula numbers, water target, the foods I can log (one portion each), the three model days, ideas, grocery list |
| `tracks.json` | Learning tracks, modules, mini projects, AI lab themes |
| `create.json` | The Saturday cycle, the precedent template, the 30 design briefs |
| `mind.json` | Reading list, optional modules |

Rules that keep my data safe:

1. **Never change an `id`.** My logs point to these ids. Change titles, times and texts freely.
2. To add something, copy a similar entry and give it a new `id`.
3. JSON is strict: double quotes, commas between entries, no comma after the last one. If the app shows "could not start", the last edit broke a file. The tests page says which.
4. Days are numbers: 1 is Monday, 7 is Sunday.
5. Times are 24 hour times like `"18:15"`, or they follow Settings with an anchor like `"@muayThai.end+45"` (45 minutes after Muay Thai ends).

Example: move Strength A to 18:30 for good. In `data/schedule.json`, find `"id": "strength-a"` and change `"start": "18:15"` to `"start": "18:30"`.

Example: change a food. In `data/nutrition.json`, each line of `foods` is ONE portion. If my bread is bigger, I change its `kcal` and `protein`, or the text in `unit`. The numbers are approximate values from standard food tables; the label on a pack is always better. There are no prices in the files: I type what I spend in the app (Food, Shop).

Example: change the bottom bar of the phone. In `js/nav.js`, the four lines with `primary: true` are the bar. Move `primary: true` to another line to swap a screen.

Example: add a design brief. In `data/create.json`, add a line to `briefs`:

```
{ "id": "b31", "text": "A shaded bench for a school gate." }
```

**Editing inside the app** is different: those changes are saved on the device as a layer on top of these files. The files are never changed by the app. Settings has "Reset to program defaults" to remove my layer.

Resource links for tutorials are not in the files. I add them in the app, in Learn, with the link button next to each module.

If I add a new file to the app (a script, a style, a data file, an icon), I also add its path to the `FILES` list at the top of `sw.js`. Without that the new file would not be available offline. The tests page tells me when a file is missing from the list.


## 6. Backups

Everything I enter lives only in the browser storage of the device. A phone can lose that: if I clear the browser data, if the device runs out of space, or on an iPhone if the site is not opened for a long time.

- **Download a backup:** Settings, Backup. Or the last step of the Sunday review. It is one file, `mind-and-body-backup-DATE.json`, with days, logs, settings and photos.
- **Keep it somewhere else:** send it to myself, or save it to a cloud folder.
- **Import:** Settings, Backup, Import a backup.
  - **Merge** adds the backup to what is on the device. If a day or an entry exists on both sides, the one changed last is kept. The settings on the device stay.
  - **Replace** deletes everything on the device first, then loads the backup.

The backup file has a version number (`schema`). If the data format changes in a future version of the app, `js/core/backup.js` has a place for a migration step so old backups still load.


## 7. Reminders

A web app without a server cannot wake up to remind me when it is closed, especially on an iPhone. So there are two honest tools:

**The calendar file (the reliable one).** Settings, Reminders, Download the .ics file. It contains my unlocked template week as weekly events, each with a 10 minute alarm, in local "floating" time so they stay at the same clock time.

To import it into Google Calendar, on a computer:

1. Open calendar.google.com. In the settings, create a new calendar and call it **Mind and Body**.
2. In the settings, open **Import & export**, choose the `.ics` file, choose the calendar **Mind and Body**, import.
3. Google Calendar sometimes ignores the alarms inside an imported file. To be sure, open the settings of the Mind and Body calendar and set its default notification to 10 minutes.

When my template changes (a new stage unlocks, or I move a block): I **delete the Mind and Body calendar**, create it again, and import the new file. That is why it must be a separate calendar: no duplicates, and my other events are never touched.

The names of the menus in Google Calendar can change a little over time.

**Notifications inside the app.** Settings, Reminders. They show 10 minutes before the next block, but only while the app is open.


## 8. Preview another day

To see how the app will look on another date, use Settings, About, "Preview another day", or add this to the address:

```
?now=2026-12-14T08:00
```

`?now=off` goes back to the real time. Careful: what I tick during a preview is saved like any other day.


## 9. Where things are

```
index.html              the page
manifest.webmanifest    name, colors and icons for the installed app
sw.js                   offline copy of the app (and the list of files to keep)
css/                    tokens.css (colors, fonts) + base, components, screens
js/main.js              start of the app
js/core/                the rules: dates, schedule, unlock, adherence, nutrition,
                        strength, learning, stats, backup, calendar. No screen code.
js/screens/             one file per screen
js/ui/                  small building blocks: sheets, forms, charts, icons
data/                   my program
icons/, fonts/          the logo, the app icons, the Inter typeface (with its license)
tests/                  the tests
tools/                  serve.ps1 (local server), make-icons.ps1 (redraw the icons)
```

To change a color or the typeface, edit `css/tokens.css`. Everything else follows.


## 10. Good to know

- The app day changes at 04:00, not at midnight. A journal written at 00:10 belongs to the day I am finishing.
- "Kept" means done or minimum. Skipped and not logged both count as missed once the day is over. Missing once is neutral.
- Work, free time, the Saturday urbanism session, football and Rotaract never count in the adherence.
- The food log counts portions, not grams. It is a clear picture, not an exact count, and it never counts in the adherence.
- "How it works" (under More) explains the whole app on one page.
- The calorie targets are estimates from a standard formula, not medical advice.
- Photos are resized to about 1280 px and stored on the device. Many photos make the backup file big; there is a "without photos" backup too.
- Date fields use the browser's own date picker, so the order of day and month follows the language of the phone. Time fields are always 24 hour.

## Simpler daily controls
Today has Edit my schedule and Reminders shortcuts. Schedule defaults to one day; choose Whole week for an overview. Tap an activity to edit or delete it; Add activity creates one. This week only affects the selected week; Every week changes the repeating schedule. Habit settings are optional.

Protein meal buttons show Breakfast, Lunch, Snack and Dinner in full. These are meal checks; grams are shown separately in Food. Notifications can be tested from Reminders, with a selectable 5/10/15/30-minute lead while the app runs. Phone-calendar imports use a fixed 10-minute alarm and need replacing after schedule changes. Closed-app push delivery still requires a hosted push service and is not enabled by this local app.
