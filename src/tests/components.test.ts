import { describe, expect, test } from "@jest/globals";

const route = (s: string) => `http://localhost:3000/${s}`;

describe("Component Routes", () => {
  const formId = 11; // ✅ Use your real form ID here

  test("creates a new component", async () => {
    const componentBody = {
      form_id: formId,
      type: "text",
      name: "username",
      properties: {
        label: "Enter your name",
        required: true,
        placeholder: "e.g. Lance Tan",
      },
    };

    const response = await fetch(route("components"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(componentBody),
    });

    expect(response.status).toBe(200);
  });

  test("fetches components for a form", async () => {
    // ✅ Use the same formId as above
    const response = await fetch(route(`forms/${formId}/components`));
    const json = await response.json();

    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0); // should now pass
  });
});
