# RJCSC — SSO Login Automation

This first version opens the official Rajasthan SSO sign-in page, fills the SSO ID and password from environment variables, and provides a protected web panel to enter CAPTCHA and OTP manually.

**This version does not solve CAPTCHA, bypass SSO security/location checks, save cookies, or use a database.** CAPTCHA and OTP are entered by the operator.

## Requirements

- Node.js 20 or newer
- An authorized Rajasthan SSO account
- Use a trusted computer/server. Do not share credentials or the access token.

## Setup

1. Clone this repository and open its folder.
2. Install dependencies:

   ```bash
   npm install
   npx playwright install chromium
   ```

   On Linux servers that need Playwright OS packages, use the Playwright install command supported by your environment (for example, `npx playwright install --with-deps chromium`).

3. Copy `.env.example` to `.env`.
4. Set `SSO_USER_ID`, `SSO_PASSWORD`, and `APP_ACCESS_TOKEN`. Use a long random access token (at least 24 characters).
5. Keep `.env` private. Never commit it to GitHub.
6. Start the app:

   ```bash
   npm start
   ```

7. Open the local URL printed in the terminal, enter the access token, and unlock the panel.
8. Click **Open SSO & fill credentials**. Review the screenshot, enter CAPTCHA manually, and click **Submit CAPTCHA**.
9. If the portal requests OTP, enter the OTP you received and click **Submit OTP**. Review the screenshot and status to confirm the final result.

## Important notes

- SSO may change its HTML selectors or require additional verification. If fields are not detected, inspect the screenshot and update selectors in `src/automation/ssoLogin.js`.
- The panel is not intended to be exposed to the public internet as-is. Keep it on a trusted host, use HTTPS and network restrictions if remote access is required, and use a strong access token.
- `HOST=127.0.0.1` keeps the service local by default. A hosted platform may require `HOST=0.0.0.0`; do not do that unless access is properly restricted.
- Headless browser screenshots can show the page but cannot let you click directly on the page. CAPTCHA and OTP are entered through the panel.
- The browser session and cookies exist only in memory. Closing/restarting the app ends the session. No cookie persistence or database is implemented yet.
- Only automate login for an account you are authorized to use, and follow the SSO portal's rules and security requirements.