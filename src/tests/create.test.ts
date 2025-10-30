import { describe, expect, test } from "@jest/globals";

const TEST_USER_ID = "892d56fa-50c6-43b3-86e9-f162329760a1";
const route = (s: string) => `http://localhost:3000/${s}`;
const unique = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

describe("Form Creation Route", () => {
  test("creates a form with ordered components", async () => {
    const body = {
      title: unique("ContactForm"),
      user_id: TEST_USER_ID,
      components: [
        {
          type: "text",
          name: unique("full_name"),
          order: 2,
          properties: { label: "Full Name", required: true },
        },
        {
          type: "select",
          name: unique("department"),
          order: 1,
          properties: {
            label: "Department",
            options: ["Sales", "Marketing", "Support"],
          },
        },
      ],
    };

    const response = await fetch(route("api/form/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(201);

    const json = await response.json();

    expect(json).toHaveProperty("id");
    expect(json.title).toBe(body.title);
    expect(Array.isArray(json.components)).toBe(true);
    expect(json.components.length).toBe(2);
    expect(json.components[0].properties.order).toBe(1);
    expect(json.components[1].properties.order).toBe(2);
  });

  test("rejects form with invalid component types", async () => {
    const response = await fetch(route("api/form/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: unique("InvalidForm"),
        user_id: TEST_USER_ID,
        components: [{ type: "email", name: unique("contact") }],
      }),
    });

    expect(response.status).toBe(400);

    const json = await response.json();

    expect(json.error).toBe("Invalid component type supplied");
    expect(Array.isArray(json.validTypes)).toBe(true);
  });
});