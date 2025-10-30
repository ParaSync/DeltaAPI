import { describe, expect, test } from "@jest/globals";
import { randomUUID } from "crypto";

const route = (s: string) => `http://localhost:3000/${s}`;

const buildFormPayload = () => ({
  title: `List Test Form ${Date.now()}`,
  user_id: "892d56fa-50c6-43b3-86e9-f162329760a1",
  components: [
    {
        type: "text",
        name: "full_name",
        order: 2,
        properties: { label: "Full Name", required: true },
    },
    {
      type: "select",
          name: "department",
          order: 1,
          properties: {
            label: "Department",
            options: ["Sales", "Marketing", "Support"],
          },
    },
  ],
});

const createForm = async () => {
  const response = await fetch(route("api/form/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildFormPayload()),
  });
  return { response, json: await response.json() };
};

describe("Form Listing Route", () => {
  test("returns forms including newly created form", async () => {
    const { response, json } = await createForm();
    expect(response.status).toBe(201);

    const listResponse = await fetch(route("api/form/list"));
    expect(listResponse.status).toBe(200);

    const { forms } = await listResponse.json();
    expect(Array.isArray(forms)).toBe(true);
    expect(forms.some((form: any) => form.id === json.id)).toBe(true);
  });

  test("returns components ordered by their order property", async () => {
    const { response, json } = await createForm();
    expect(response.status).toBe(201);

    const listResponse = await fetch(route("api/form/list"));
    const { forms } = await listResponse.json();

    const target = forms.find((form: any) => form.id === json.id);
    expect(target).toBeTruthy();
    expect(Array.isArray(target.components)).toBe(true);
    expect(target.components.length).toBeGreaterThan(0);

    const orders = target.components.map(
      (component: any) => component.properties?.order ?? 0
    );
    const sortedOrders = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sortedOrders);
  });
});