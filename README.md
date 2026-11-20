# Permit Wait-Time Study

A one-month survey tool from Powertec Utilities. It measures the time from a competent person (CP) being ready to receive a safety document to the document being signed.

- The AP office registers each approved request: the request number, the CP number and the document type.
- The CP opens the request on their phone by its number.
- "Ready to receive" and "document signed" are each confirmed jointly. The issuing AP enters their AP number and PIN on the CP's phone, and both confirm they are together.
- Times are stamped by the server, not the phone.
- Results: median, average and longest wait; person-hours; estimated cost; what held up the issue; office against on site; document type.

## Files

| File | Purpose |
|---|---|
| index.html | The study page: CP, AP office and Results |
| app.js | Page logic. Runs a demonstration when no back end is set. |
| styles.css | Styling |
| config.js | Back-end URL and site name |
| qr.html | Printable QR cards, one per CP |
| mark.png, favicon.png | Powertec mark |
| Code.gs | Google Apps Script back end. Paste into the Sheet's Apps Script editor. It is not run by GitHub. |
| SETUP.md | Step-by-step set-up |

See SETUP.md to set it up.
