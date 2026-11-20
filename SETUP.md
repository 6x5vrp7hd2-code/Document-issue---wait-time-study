# Setting up the Permit Wait-Time Study

The study has two parts:

- **The page** (index.html, app.js, styles.css, config.js, qr.html and the two images). This is hosted free on GitHub Pages.
- **The record** is a Google Sheet. A short Google Apps Script (Code.gs) receives every confirmation, checks the AP PIN and stamps the time with Google's clock. Nobody can record a time early by changing their phone's clock.

Allow about 20 minutes. Steps 1 to 4 are easier on a computer than on a phone.

## 1. Create the Google Sheet

1. Go to sheets.google.com and create a blank spreadsheet.
2. Name it, for example, "Permit Wait-Time Study, Site name".
3. Leave it empty. The script creates the "Requests" and "APs" tabs itself.

## 2. Add the script

1. In the Sheet, open **Extensions > Apps Script**.
2. Delete the sample code in the editor.
3. Paste the whole of **Code.gs**.
4. Click **Save**.

## 3. Set the office passcode and PIN salt

1. In Apps Script, open **Project Settings** (the gear icon on the left).
2. Scroll to **Script Properties** and choose **Add script property**.
3. Add two properties:

| Property | Value |
|---|---|
| `OFFICE_PASSCODE` | The passcode the AP office will use to register requests and set PINs. |
| `PIN_SALT` | Any long random text, for example `pt-7Kq2-xR91-mwL4`. Set it once and never change it; changing it makes every AP PIN invalid. |

4. Click **Save script properties**.

## 4. Publish the script as a web app

1. Click **Deploy > New deployment**.
2. Next to "Select type", click the gear and choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**. CPs use the page without signing in to Google. The record is still protected: only the office passcode can register requests, and only a correct AP PIN can record a time.
5. Click **Deploy** and approve the permissions Google asks for. Google may say the app is unverified; choose **Advanced > Go to (project name)**, since this is your own script.
6. Copy the **Web app URL**. It ends in `/exec`.

If you change Code.gs later, use **Deploy > Manage deployments > Edit > New version**. This keeps the same URL.

## 5. Connect the page to the script

1. Open **config.js**.
2. Paste the URL between the quotes after `apiUrl:`.
3. Optionally, add the site name. For example:

```js
window.PT_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfy...../exec",
  siteName: "Site name"
};
```

While `apiUrl` is empty, the page runs in demonstration mode: example data, nothing saved. Office passcode `demo`; try request `EX-113` with `CP05`, `AP01`, PIN `1234`.

## 6. Put the page on GitHub Pages

1. On github.com, create a new repository, for example `permit-wait-study`.
2. Choose **Add file > Upload files** and upload every file from this folder except Code.gs, SETUP.md and README.md. Those three can be uploaded too; they do no harm.
3. Click **Commit changes**.
4. Open **Settings > Pages**.
5. Under "Build and deployment", set **Source** to **Deploy from a branch**, choose **main**, folder **/ (root)**, and click **Save**.
6. After a minute or two the page is live at `https://<your-account>.github.io/permit-wait-study/`.

## 7. Prepare the study

1. Open the page, choose **AP office** and enter the office passcode.
2. Optional: click **Load examples** to see how the results look. Click **Remove examples** before the real study starts.
3. Under **AP PINs**, each issuing AP sets their own AP number and PIN.
4. Click **Print CP QR cards**, set the CP number range and print. Give each CP their card. Scanning it opens the page with their CP number filled in.

## 8. Running the study

**AP office:** when a document request is approved, register it on the page: the request number, the CP number and the document type.

**CP and AP together:**

1. The CP opens the request on their phone with the request number.
2. **Ready to receive.** When the CP is with the issuing AP and ready to receive the document, at the office or on site, the AP enters their AP number and PIN on the CP's phone. Both tick the box to confirm they are together, then press confirm.
3. **Document signed.** When the document is signed, the AP enters their number and PIN again. The CP chooses what held up the issue, and they confirm.

The server records both times. A CP cannot record "ready" without the AP's PIN, so nobody can record arrival before they are there.

**Results:** the Results tab shows the median, average and longest wait, person-hours lost, estimated cost, causes, office against on site, and document type. **Copy as CSV** copies every completed record. The Google Sheet holds the full record at all times.

## Notes

- No names are recorded, only CP and AP numbers.
- If an AP forgets their PIN, the office sets a new one under **AP PINs**.
- To change the office passcode, edit `OFFICE_PASSCODE` in Script Properties. There is no need to redeploy.
- The page checks for new records every 20 seconds.
