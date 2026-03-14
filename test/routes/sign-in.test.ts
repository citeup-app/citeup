import { expect } from "@playwright/test";
import { beforeAll, describe, it } from "vitest";
import { hashPassword } from "~/lib/auth.server";
import prisma from "~/lib/prisma.server";
import { goto, port } from "../helpers/launchBrowser";

const EMAIL = "sign-in-test@example.com";
const PASSWORD = "test-password-123";

describe("sign-in route", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: "user-1",
        email: EMAIL,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
  });

  it("shows the sign-in form", async () => {
    const page = (await goto("/sign-in")).locator("main");
    await expect(
      page.getByRole("textbox", { name: "Email", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Password", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("shows error for wrong credentials", async () => {
    const page = (await goto("/sign-in")).locator("main");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(EMAIL);
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("email and password do not match"),
    ).toBeVisible();
  });

  it("redirects to home on successful sign-in", async () => {
    const page = await goto("/sign-in");
    await page
      .locator("main")
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(EMAIL);
    await page
      .locator("main")
      .getByRole("textbox", { name: "Password", exact: true })
      .fill(PASSWORD);
    await page.locator("main").getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`http://localhost:${port}/sites`);
    expect(new URL(page.url()).pathname).toBe("/sites");
  });

  it("should match visually", async () => {
    const page = await goto("/sign-in");
    await expect(page.locator("main")).toMatchVisual({
      name: "sign-in",
    });
  });

  it("clicks the sign-up button and redirects to sign-up page", async () => {
    const page = await goto("/sign-in");
    await page.getByRole("link", { name: "Sign up" }).click();
    await page.waitForURL("**/sign-up");
    expect(new URL(page.url()).pathname).toBe("/sign-up");
  });

  it("clicks the forgot password button and redirects to password recovery page", async () => {
    const page = await goto("/sign-in");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.waitForURL("**/password-recovery");
    expect(new URL(page.url()).pathname).toBe("/password-recovery");
  });
});
