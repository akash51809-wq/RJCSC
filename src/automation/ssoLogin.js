import { chromium } from "playwright";

const SSO_URL = "https://sso.rajasthan.gov.in/signin";
let browser;
let page;
let status = { running: false, stage: "idle", message: "Ready. Start login to open the Rajasthan SSO page." };

function setStatus(stage, message) {
  status = { running: Boolean(browser?.isConnected()), stage, message };
}
async function firstVisible(candidates) {
  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 700 })) return locator;
    } catch {}
  }
  return null;
}
async function fillFirst(candidates, value, fieldName) {
  const locator = await firstVisible(candidates);
  if (!locator) throw new Error("Could not find the " + fieldName + " field. The SSO page layout may have changed.");
  await locator.fill(value);
  return locator;
}

export async function startSsoLogin() {
  if (!process.env.SSO_USER_ID || !process.env.SSO_PASSWORD) {
    throw new Error("Add SSO_USER_ID and SSO_PASSWORD to .env, then restart the server.");
  }
  await closeBrowser();
  browser = await chromium.launch({ headless: String(process.env.HEADLESS || "true").toLowerCase() !== "false" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  setStatus("opening", "Opening Rajasthan SSO login page…");
  await page.goto(SSO_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);

  await fillFirst([
    'input[placeholder*="Digital Identity" i]',
    'input[placeholder*="SSOID" i]',
    'input[name*="username" i]',
    'input[id*="username" i]',
    'input[name*="sso" i]',
    'input[id*="sso" i]',
    'input[type="text"]'
  ], process.env.SSO_USER_ID, "SSO ID");

  await fillFirst([
    'input[type="password"]',
    'input[placeholder*="Password" i]',
    'input[name*="password" i]',
    'input[id*="password" i]'
  ], process.env.SSO_PASSWORD, "password");

  setStatus("captcha", "SSO page is open and credentials are filled. Enter the CAPTCHA shown in the screenshot, then press Submit CAPTCHA.");
  return status;
}

export async function submitCaptcha(value) {
  if (!page || page.isClosed()) throw new Error("Start login first.");
  const captcha = String(value || "").trim();
  if (!captcha) throw new Error("Enter the CAPTCHA displayed on the SSO page.");
  if (captcha.length > 20) throw new Error("CAPTCHA value is too long.");

  await fillFirst([
    'input[placeholder*="Enter Captcha" i]',
    'input[placeholder*="captcha" i]',
    'input[aria-label*="captcha" i]',
    'input[name*="captcha" i]',
    'input[id*="captcha" i]'
  ], captcha, "CAPTCHA");

  const loginButton = await firstVisible([
    'button:has-text("Login")',
    'input[type="submit"][value*="Login" i]',
    'button[type="submit"]',
    'input[type="submit"]'
  ]);
  if (!loginButton) throw new Error("Could not find the Login button. Check the SSO page screenshot.");
  await loginButton.click();
  await page.waitForTimeout(1800);
  setStatus("otp-or-result", "CAPTCHA submitted. If the portal requests OTP, enter it below. If there is an error or another security check, review the screenshot and follow the portal instructions.");
  return status;
}

export async function submitOtp(value) {
  if (!page || page.isClosed()) throw new Error("Start login first.");
  const otp = String(value || "").trim();
  if (!otp) throw new Error("Enter the OTP you received.");
  if (!/^\d{4,8}$/.test(otp)) throw new Error("Enter the numeric OTP exactly as received (4–8 digits).");

  const otpField = await firstVisible([
    'input[autocomplete="one-time-code"]',
    'input[placeholder*="OTP" i]',
    'input[placeholder*="verification code" i]',
    'input[aria-label*="OTP" i]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
    'input[name*="verification" i]',
    'input[type="tel"]'
  ]);
  if (!otpField) throw new Error("OTP field was not detected. Refresh the screenshot and confirm the portal is asking for OTP.");
  await otpField.fill(otp);

  const verifyButton = await firstVisible([
    'button:has-text("Verify")',
    'button:has-text("Validate")',
    'button:has-text("Submit")',
    'button:has-text("Continue")',
    'input[type="submit"]',
    'button[type="submit"]'
  ]);
  if (!verifyButton) throw new Error("Could not find the OTP verification button. Review the screenshot.");
  await verifyButton.click();
  await page.waitForTimeout(2200);

  const currentUrl = page.url();
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 2500);
  if (currentUrl !== SSO_URL && !/invalid|incorrect|failed|captcha|verification/i.test(bodyText)) {
    setStatus("possible-success", "The page moved after OTP submission. Please verify visually that the SSO dashboard is open. No cookies have been saved.");
  } else {
    setStatus("check-result", "OTP submitted. Review the screenshot for success, an error, or another required security step.");
  }
  return status;
}

export function getState() {
  return { ...status, url: page && !page.isClosed() ? page.url() : null };
}
export async function getScreenshot() {
  if (!page || page.isClosed()) return null;
  return await page.screenshot({ type: "png", fullPage: false });
}
export async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
  }
  browser = undefined;
  page = undefined;
  status = { running: false, stage: "idle", message: "Browser closed. No cookies or database records were saved." };
  return status;
}