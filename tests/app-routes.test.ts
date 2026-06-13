import { describe, expect, it, vi } from "vitest";

// App pulls in the screens, which pull in the question bank and Firebase.
// Stub them so this stays a fast, DOM-free routing test.
vi.mock("../src/screens/Home", () => ({ default: () => null }));
vi.mock("../src/screens/Drill", () => ({ default: () => null }));
vi.mock("../src/screens/Exam", () => ({ default: () => null }));
vi.mock("../src/screens/Diagnostic", () => ({ default: () => null }));
vi.mock("../src/screens/Review", () => ({ default: () => null }));
vi.mock("../src/screens/Dashboard", () => ({ default: () => null, KidDetail: () => null }));
vi.mock("../src/screens/Login", () => ({
  DeniedScreen: () => null,
  ErrorScreen: () => null,
  LoadingScreen: () => null,
  LoginScreen: () => null,
}));
vi.mock("../src/state/AppData", () => ({ useAppData: () => ({}) }));

import { createRoutesFromElements, matchRoutes } from "react-router-dom";
import { appRoutes } from "../src/App";

// `appRoutes(role)` returns a <Routes> element; its children are the routes.
function routesFor(role: "parent" | "student") {
  return createRoutesFromElements(appRoutes(role).props.children);
}

function leafPath(role: "parent" | "student", url: string): string | undefined {
  const matches = matchRoutes(routesFor(role), url);
  return matches?.[matches.length - 1]?.route.path;
}

describe("app route table", () => {
  it("known paths match their own routes", () => {
    expect(leafPath("student", "/")).toBe("/");
    expect(leafPath("student", "/exam")).toBe("/exam");
    expect(leafPath("student", "/drill/right-of-way")).toBe("/drill/:topic");
  });

  it("a student deep-linking to /dashboard falls through to the catch-all", () => {
    // Not registered for students — must hit the "*" redirect, not blank out.
    expect(leafPath("student", "/dashboard")).toBe("*");
    expect(leafPath("student", "/dashboard/kidA")).toBe("*");
  });

  it("the parent's dashboard routes are registered (no catch-all)", () => {
    expect(leafPath("parent", "/dashboard")).toBe("/dashboard");
    expect(leafPath("parent", "/dashboard/kidA")).toBe("/dashboard/:uid");
  });

  it("any unknown URL falls through to the catch-all", () => {
    expect(leafPath("student", "/totally-unknown")).toBe("*");
    expect(leafPath("parent", "/nope/nope/nope")).toBe("*");
  });
});
