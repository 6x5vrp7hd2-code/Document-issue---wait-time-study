# Permit Wait-Time Study

A one-month survey tool from Powertec Utilities. It measures the time from a competent person (CP) arriving to receive a safety document to the document being issued.

- The AP office registers each approved request: the request number, the CP number, the size of the working party and the document type. The request then appears on every AP's phone.
- When the CP arrives, the AP opens the request on his phone. The CP enters his CP number and presses Activate. The clock starts.
- Once the document is issued, the CP enters his CP number and presses Complete, and the AP agrees with his PIN. The clock stops.
- Times are stamped by the server, not the phone.
- Results: median, average and longest wait; person-hours (the wait multiplied by the CP plus his working party); estimated cost; what held it up; office against on site; document type.

## Files

| File | Purpose |
|---|---|
| index.html | The study page: AP issue, AP office and Results |
| app.js | Page logic. Runs a demonstration when no back end is set. |
| styles.css | Styling |
| config.js | Back-end URL and site name |
| mark.png, favicon.png | Powertec mark |
| Code.gs | Google Apps Script back end. Paste into the Sheet's Apps Script editor. It is not run by GitHub. |
| SETUP.md | Step-by-step set-up |

See SETUP.md to set it up.
